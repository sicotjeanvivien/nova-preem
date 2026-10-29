import { buildCollectionFile, fileSettingsSchema, parseCollectionFile, serializeCollectionFile } from "./collectionFile.ts";
import {
  firstSyncAction,
  mergeCollections,
  resolveFirstSync,
  sameContent,
  type FirstSyncChoice,
  type RemoteContent,
  type SyncContent,
  type SyncState,
} from "./sync.ts";

// One synchronization (docs/sync-spec.md §5.2), written against interfaces:
// the remote file provider (Google Drive today) and the authorization.

/** A version of the remote collection file. */
export interface RemoteFileRef {
  id: string;
  /** Changes on every write of the file. */
  version: string;
}

export type RemoteErrorCode = "changed" | "not-found" | "unauthorized" | "storage-full" | "network";

export class RemoteError extends Error {
  constructor(readonly code: RemoteErrorCode, message: string = code) {
    super(message);
    this.name = "RemoteError";
  }
}

/** The collection file in the user's cloud (sync spec §6). Failures are RemoteError. */
export interface RemoteFileProvider {
  /**
   * The collection file: `knownId` if it still exists (not trashed), otherwise
   * the oldest file marked as a collection; `others`: the other files found.
   */
  find(knownId: string | null): Promise<{ file: RemoteFileRef | undefined; others: number }>;
  download(file: RemoteFileRef): Promise<{ text: string; version: string }>;
  create(text: string): Promise<RemoteFileRef>;
  /** Fails with "changed" if the file's version is no longer `file.version`. */
  update(file: RemoteFileRef, text: string): Promise<RemoteFileRef>;
}

export interface AccessToken {
  value: string;
  expiresAt: string;
}

/** cancelled: the pop-up was closed; denied: access refused (or Drive unticked); unavailable: Google could not be reached. */
export type AuthErrorCode = "cancelled" | "denied" | "unavailable";

export class AuthError extends Error {
  constructor(readonly code: AuthErrorCode, message: string = code) {
    super(message);
    this.name = "AuthError";
  }
}

/** Authorization to the user's cloud (sync spec §4.1). Failures are AuthError. */
export interface SyncAuth {
  /** Gets ready ahead of a tap, so that the pop-up opens right away (browsers block late pop-ups). */
  prepare(): void;
  /** Asks the user (a Google pop-up: call it from a tap). `hint`: the account to suggest. */
  authorize(hint: string | null): Promise<{ token: AccessToken; account: string | null }>;
  revoke(token: string): Promise<void>;
}

export interface SyncContext {
  appVersion: string;
  catalogVersion: string;
  now: string;
}

export type SyncOutcome =
  /** Synced: `content` is now on both sides (to apply locally if it differs). */
  | { kind: "done"; state: SyncState; content: SyncContent }
  /** First sync with a collection on both sides: the user chooses (sync spec §3.3). */
  | { kind: "ask"; state: SyncState; remote: RemoteContent; remoteDate: string }
  /** Nothing was written; `state` carries the error to show, if any (sync spec §7). */
  | { kind: "failed"; state: SyncState };

const MAX_ATTEMPTS = 3;

/**
 * One synchronization (sync spec §5.2): find the file, download it, merge
 * with the base, upload if needed. Never writes locally: the caller applies
 * `content`. `choice`: the answer to a previous "ask".
 */
export async function synchronize(
  remote: RemoteFileProvider,
  state: SyncState,
  local: SyncContent,
  context: SyncContext,
  choice?: FirstSyncChoice,
): Promise<SyncOutcome> {
  const serialize = (content: SyncContent) =>
    serializeCollectionFile(buildCollectionFile({ ...content, appVersion: context.appVersion, catalogVersion: context.catalogVersion, now: context.now }));
  const done = (file: RemoteFileRef, content: SyncContent, notice: SyncState["notice"]): SyncOutcome => ({
    kind: "done",
    content,
    state: { ...state, fileId: file.id, base: content, baseVersion: file.version, lastSyncAt: context.now, lastError: null, notice },
  });

  try {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const { file, others } = await remote.find(state.fileId);
      const othersNotice: SyncState["notice"] = others > 0 ? { kind: "other-files", count: others } : null;
      if (!file) {
        // No file: first sync, or the file was deleted (or trashed) since: recreated from the device.
        const created = await remote.create(serialize(local));
        return done(created, local, state.base ? { kind: "recreated" } : othersNotice);
      }

      const downloaded = await remote.download(file);
      const parsed = parseCollectionFile(downloaded.text);
      if (!parsed.ok) return { kind: "failed", state: { ...state, fileId: file.id, lastError: "invalid-file" } };
      const remoteContent: RemoteContent = { entries: parsed.file.entries, settings: parsed.file.settings };
      const current: RemoteFileRef = { id: file.id, version: downloaded.version };

      let result: SyncContent;
      if (state.base) {
        result = mergeCollections(state.base, local, remoteContent);
      } else {
        const action = firstSyncAction(local.entries, remoteContent);
        if (action === "ask" && !choice) return { kind: "ask", state: { ...state, fileId: file.id }, remote: remoteContent, remoteDate: parsed.file.exportedAt };
        const resolved = action === "take-remote" ? "keep-remote" : action === "keep-local" ? "keep-local" : choice!;
        result = resolveFirstSync(resolved, local, remoteContent);
      }

      // Written only if its content changes (sync spec §2), or if it lacks settings.
      const remoteSettings = fileSettingsSchema.safeParse(remoteContent.settings);
      if (remoteSettings.success && sameContent(result, { entries: [...remoteContent.entries], settings: remoteSettings.data })) {
        return done(current, result, othersNotice);
      }
      try {
        return done(await remote.update(current, serialize(result)), result, othersNotice);
      } catch (error) {
        // Written elsewhere in the meantime: start again from the download.
        if (error instanceof RemoteError && error.code === "changed") continue;
        throw error;
      }
    }
    return { kind: "failed", state };
  } catch (error) {
    if (!(error instanceof RemoteError)) throw error;
    switch (error.code) {
      case "unauthorized":
        // The token is no longer accepted: paused until the user authorizes again.
        return { kind: "failed", state: { ...state, token: null } };
      case "storage-full":
        return { kind: "failed", state: { ...state, lastError: "storage-full" } };
      default:
        // Network, server: the changes stay pending (no error shown).
        return { kind: "failed", state };
    }
  }
}
