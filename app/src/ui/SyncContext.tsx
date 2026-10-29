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
import { useOnline } from "../platform/connectivity.ts";
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

/** Delays of the automatic sync (sync spec §5.1, §7), in milliseconds. */
export const SYNC_DELAYS = {
  /** After the last change: a burst of entries gives one sync. */
  afterChange: 5_000,
  /** First retry after a network or server failure, then doubled each time. */
  retry: 30_000,
  maxRetry: 10 * 60_000,
};

/**
 * Google Drive sync (docs/sync-spec.md): connection, manual and automatic sync
 * (§5.1). A sync never blocks entry; its result is merged with what was
 * entered meanwhile (three-way, with the content the sync started from as the base).
 */
export function SyncProvider({ children }: { children: ReactNode }) {
  const { services, catalog, settings, updateSettings } = useApp();
  const { entries, replaceAll } = useCollection();
  const sync = services.sync;
  const [state, setState] = useState<SyncState | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [question, setQuestion] = useState<FirstSyncQuestion | null>(null);
  const [loaded, setLoaded] = useState(false);
  // Re-renders when the token expires, for the paused status.
  const [, setClock] = useState(0);
  const running = useRef(false);
  const retries = useRef(0);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const changeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const online = useOnline();

  const local: SyncContent = useMemo(() => ({ entries: [...entries.values()], settings: fileSettings(settings) }), [entries, settings]);
  // The latest content and state, for the steps that run after an await.
  const latest = useRef({ local, state, settings });
  latest.current = { local, state, settings };

  useEffect(() => {
    let cancelled = false;
    sync?.store
      .load()
      .then((stored) => {
        if (cancelled) return;
        setState(stored ?? null);
        latest.current.state = stored ?? null;
        setLoaded(true);
      })
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

  /** Applies the synced content on top of what was entered since the sync started; returns the local content. */
  const apply = useCallback(
    async (started: SyncContent, synced: SyncContent): Promise<SyncContent> => {
      const now = latest.current.local;
      const entriesNow = mergeEntries(started.entries, now.entries, synced.entries);
      if (!sameContent({ entries: entriesNow, settings: now.settings }, now)) await replaceAll(entriesNow);
      const settingsNow = mergeSettings(started.settings, now.settings, synced.settings);
      const changes = Object.fromEntries(Object.entries(settingsNow).filter(([key, value]) => JSON.stringify(value) !== JSON.stringify(now.settings[key as keyof FileSettings])));
      if (Object.keys(changes).length > 0) updateSettings(changes);
      latest.current.local = { entries: entriesNow, settings: settingsNow };
      return latest.current.local;
    },
    [replaceAll, updateSettings],
  );

  /** A sync 5 s after the last change (sync spec §5.1): a burst of entries gives a single sync. */
  const syncSoon = useCallback(() => {
    clearTimeout(changeTimer.current);
    changeTimer.current = setTimeout(() => void autoRef.current(), SYNC_DELAYS.afterChange);
  }, []);

  const run = useCallback(
    async (from: SyncState, choice?: FirstSyncChoice) => {
      if (!sync || running.current || !from.token || !tokenValid(from.token, new Date().toISOString())) return;
      running.current = true;
      setSyncing(true);
      const started = latest.current.local;
      let succeeded = false;
      try {
        const context = { appVersion: services.appVersion, catalogVersion: catalog.manifest.version, now: new Date().toISOString() };
        const outcome = await synchronize(sync.remote(from.token.value), from, started, context, choice);
        if (outcome.kind === "done") {
          await apply(started, outcome.content);
          succeeded = true;
        }
        if (outcome.kind === "ask") {
          // Not saved: until the user chooses, sync is not turned on (sync spec §3.3).
          hold(outcome.state);
          setQuestion({ remote: outcome.remote, remoteDate: outcome.remoteDate });
        } else {
          await save(outcome.state);
        }
        // Network or server failure (no error kept, token still there): a new try later, each time further apart.
        clearTimeout(retryTimer.current);
        if (outcome.kind === "failed" && !outcome.state.lastError && outcome.state.token) {
          const delay = Math.min(SYNC_DELAYS.retry * 2 ** retries.current, SYNC_DELAYS.maxRetry);
          retries.current++;
          retryTimer.current = setTimeout(() => void autoRef.current(), delay);
        } else {
          retries.current = 0;
        }
      } catch (error) {
        console.error("Sync failed", error);
      } finally {
        running.current = false;
        setSyncing(false);
        // Entered during a successful sync: kept, and sent by the next one (sync spec §5.2).
        const { state: after, local: now } = latest.current;
        if (succeeded && after?.base && pendingChangeCount(after.base, now) > 0) syncSoon();
      }
    },
    [sync, services.appVersion, catalog.manifest.version, apply, save, hold, syncSoon],
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

  /**
   * Automatic sync (sync spec §5.1): only once the first sync is done (it may
   * ask the user), online, with a valid token, and no question pending.
   */
  const auto = useCallback(async () => {
    const current = latest.current.state;
    if (!current?.base || current.lastError === "revoked" || !navigator.onLine) return;
    await run(current);
  }, [run]);
  const autoRef = useRef(auto);
  autoRef.current = auto;

  // At launch, and when the app comes back to the foreground.
  useEffect(() => {
    if (!loaded) return;
    void autoRef.current();
    const onVisible = () => document.visibilityState === "visible" && void autoRef.current();
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [loaded]);

  // When the network comes back.
  useEffect(() => {
    if (loaded && online) void autoRef.current();
  }, [loaded, online]);

  useEffect(
    () => () => {
      clearTimeout(retryTimer.current);
      clearTimeout(changeTimer.current);
    },
    [],
  );

  const now = new Date().toISOString();
  const pendingChanges = state ? pendingChangeCount(state.base, local) : 0;

  // On each actual change of the collection or the synced settings. Not at launch
  // (the sync is immediate), nor after a failed sync (it waits for its retry).
  const changedContent = useRef(local);
  useEffect(() => {
    if (changedContent.current === local) return;
    changedContent.current = local;
    // During a sync, its end checks what is left to send.
    if (loaded && pendingChanges > 0 && !running.current) syncSoon();
  }, [loaded, local, pendingChanges, syncSoon]);

  // The status turns to "paused" when the token expires, without waiting for another render.
  const expiresAt = state?.token?.expiresAt;
  useEffect(() => {
    if (!expiresAt) return;
    const timer = setTimeout(() => setClock((tick) => tick + 1), Math.max(0, Date.parse(expiresAt) - Date.now()) + 1000);
    return () => clearTimeout(timer);
  }, [expiresAt]);
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
