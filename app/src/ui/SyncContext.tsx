import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { fileSettingsSchema, type FileSettings } from "../domain/collectionFile.ts";
import {
  connectedState,
  mergeEntries,
  mergeSettings,
  pendingChangeCount,
  sameContent,
  syncStatus,
  tokenValid,
  type FirstSyncChoice,
  type RemoteContent,
  type SyncContent,
  type SyncState,
  type SyncStatus,
} from "../domain/sync.ts";
import { AuthError, synchronize } from "../domain/syncEngine.ts";
import type { Settings } from "../domain/settings.ts";
import { useApp } from "./AppContext.tsx";
import { useCollection } from "./CollectionContext.tsx";

/** The first sync waiting for the user's choice (sync spec §3.3, SyncFirst). */
export interface FirstSyncQuestion {
  remote: RemoteContent;
  remoteDate: string;
}

interface SyncContextValue {
  /** False when the build has no Google client ID: the Settings keep the "Bientôt" row. */
  available: boolean;
  /** The device's sync state; null when sync is off. */
  state: SyncState | null;
  status: SyncStatus;
  pendingChanges: number;
  question: FirstSyncQuestion | null;
  /** Link to the file in Drive, once known. */
  fileUrl: string | null;
  /** Prepares Google's pop-up ahead of a tap (Settings). */
  prepare(): void;
  connect(): Promise<void>;
  syncNow(): Promise<void>;
  resume(): Promise<void>;
  answer(choice: FirstSyncChoice): Promise<void>;
  /** Cancels the first sync: sync is not turned on (sync spec §3.3). */
  cancelFirstSync(): Promise<void>;
  disconnect(): Promise<void>;
}

const SyncContext = createContext<SyncContextValue | null>(null);

const fileSettings = (settings: Settings): FileSettings => fileSettingsSchema.parse(settings);

/**
 * Google Drive sync (docs/sync-spec.md), step 2: connection and manual sync.
 * A sync never blocks entry; its result is merged with what was entered
 * meanwhile (three-way, with the content the sync started from as the base).
 */
export function SyncProvider({ children }: { children: ReactNode }) {
  const { services, catalog, settings, updateSettings } = useApp();
  const { entries, replaceAll } = useCollection();
  const sync = services.sync;
  const [state, setState] = useState<SyncState | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [question, setQuestion] = useState<FirstSyncQuestion | null>(null);
  const running = useRef(false);

  const local: SyncContent = useMemo(() => ({ entries: [...entries.values()], settings: fileSettings(settings) }), [entries, settings]);
  // The latest content and state, for the steps that run after an await.
  const latest = useRef({ local, state, settings });
  latest.current = { local, state, settings };

  useEffect(() => {
    let cancelled = false;
    sync?.store
      .load()
      .then((loaded) => !cancelled && setState(loaded ?? null))
      .catch((error: unknown) => console.error("Sync state could not be read", error));
    return () => {
      cancelled = true;
    };
  }, [sync]);

  /** In memory only: a connection is kept on the device once its first sync has run. */
  const hold = useCallback((next: SyncState | null) => {
    setState(next);
    latest.current.state = next;
  }, []);

  const save = useCallback(
    async (next: SyncState | null) => {
      hold(next);
      if (!sync) return;
      await (next ? sync.store.save(next) : sync.store.clear());
    },
    [sync, hold],
  );

  /** Applies the synced content on top of what was entered since the sync started. */
  const apply = useCallback(
    async (started: SyncContent, synced: SyncContent) => {
      const now = latest.current.local;
      const entriesNow = mergeEntries(started.entries, now.entries, synced.entries);
      if (!sameContent({ entries: entriesNow, settings: now.settings }, now)) await replaceAll(entriesNow);
      const settingsNow = mergeSettings(started.settings, now.settings, synced.settings);
      const changes = Object.fromEntries(Object.entries(settingsNow).filter(([key, value]) => JSON.stringify(value) !== JSON.stringify(now.settings[key as keyof FileSettings])));
      if (Object.keys(changes).length > 0) updateSettings(changes);
    },
    [replaceAll, updateSettings],
  );

  const run = useCallback(
    async (from: SyncState, choice?: FirstSyncChoice) => {
      if (!sync || running.current || !from.token || !tokenValid(from.token, new Date().toISOString())) return;
      running.current = true;
      setSyncing(true);
      const started = latest.current.local;
      try {
        const context = { appVersion: services.appVersion, catalogVersion: catalog.manifest.version, now: new Date().toISOString() };
        const outcome = await synchronize(sync.remote(from.token.value), from, started, context, choice);
        if (outcome.kind === "done") await apply(started, outcome.content);
        if (outcome.kind === "ask") {
          // Not saved: until the user chooses, sync is not turned on (sync spec §3.3).
          hold(outcome.state);
          setQuestion({ remote: outcome.remote, remoteDate: outcome.remoteDate });
        } else {
          await save(outcome.state);
        }
      } catch (error) {
        console.error("Sync failed", error);
      } finally {
        running.current = false;
        setSyncing(false);
      }
    },
    [sync, services.appVersion, catalog.manifest.version, apply, save, hold],
  );

  /** Opens Google's pop-up; null if the user closed it. */
  const authorize = useCallback(
    async (hint: string | null) => {
      if (!sync) return null;
      try {
        return await sync.auth.authorize(hint);
      } catch (error) {
        if (error instanceof AuthError && error.code === "denied") throw error;
        console.warn("Google sign-in interrupted", error);
        return null;
      }
    },
    [sync],
  );

  const connect = useCallback(async () => {
    const previous = latest.current.state;
    let authorized;
    try {
      authorized = await authorize(previous?.account ?? null);
    } catch {
      return;
    }
    if (!authorized) return;
    // Signing in again after a withdrawal, with the same account: the base stays valid.
    const next =
      previous && previous.account === authorized.account
        ? { ...previous, token: authorized.token, lastError: null }
        : connectedState(authorized.account, authorized.token);
    hold(next);
    await run(next);
  }, [authorize, hold, run]);

  const resume = useCallback(async () => {
    const current = latest.current.state;
    if (!current) return;
    let authorized;
    try {
      authorized = await authorize(current.account);
    } catch {
      // Access refused: Google Drive is no longer authorized (sync spec §7).
      await save({ ...current, token: null, lastError: "revoked" });
      return;
    }
    if (!authorized) return;
    const next = { ...current, token: authorized.token, account: authorized.account ?? current.account };
    await save(next);
    await run(next);
  }, [authorize, save, run]);

  const syncNow = useCallback(async () => {
    const current = latest.current.state;
    if (!current) return;
    if (tokenValid(current.token, new Date().toISOString())) await run(current);
    else await resume();
  }, [run, resume]);

  const answer = useCallback(
    async (choice: FirstSyncChoice) => {
      const current = latest.current.state;
      setQuestion(null);
      if (current) await run(current, choice);
    },
    [run],
  );

  const disconnect = useCallback(async () => {
    const current = latest.current.state;
    setQuestion(null);
    await save(null);
    if (current?.token && sync) await sync.auth.revoke(current.token.value).catch((error: unknown) => console.warn("Token revocation failed", error));
  }, [save, sync]);

  const now = new Date().toISOString();
  const pendingChanges = state ? pendingChangeCount(state.base, local) : 0;
  const status = syncStatus({
    connected: state !== null,
    tokenValid: tokenValid(state?.token ?? null, now),
    syncing,
    lastError: state?.lastError ?? null,
    pendingChanges,
  });
  const fileId = state?.fileId ?? null;

  const value = useMemo<SyncContextValue>(
    () => ({
      available: sync !== null,
      state,
      status,
      pendingChanges,
      question,
      fileUrl: fileId && sync ? sync.fileUrl(fileId) : null,
      prepare: () => sync?.auth.prepare(),
      connect,
      syncNow,
      resume,
      answer,
      cancelFirstSync: disconnect,
      disconnect,
    }),
    [sync, state, status, pendingChanges, question, fileId, connect, syncNow, resume, answer, disconnect],
  );
  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

export function useSync(): SyncContextValue {
  const value = useContext(SyncContext);
  if (!value) throw new Error("useSync must be used inside SyncProvider");
  return value;
}
