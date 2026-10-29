import { z } from "zod";
import { collectionEntrySchema, type CollectionEntry } from "./collection.ts";
import { fileSettingsSchema, mergeLargest, type FileSettings } from "./collectionFile.ts";

// Synchronization of the collection with a file in the user's cloud
// (docs/sync-spec.md): three-way merge, first sync, status.

/** What is synced (sync spec §2.1): every entry and the settings of the collection file. */
export interface SyncContent {
  entries: CollectionEntry[];
  settings: FileSettings;
}

/** The remote file's content: its settings may be partial or missing (a hand-edited file, an older app). */
export interface RemoteContent {
  entries: readonly CollectionEntry[];
  settings?: Partial<FileSettings> | undefined;
}

const byPrintingId = (a: CollectionEntry, b: CollectionEntry) => (a.printingId < b.printingId ? -1 : a.printingId > b.printingId ? 1 : 0);

/**
 * Three-way merge of the entries (sync spec §3.2): for each printing,
 * base + (local − base) + (remote − base), at least 0. A missing entry counts
 * as 0. Dates: the oldest first addition and the latest addition of the three.
 * Entries that end at 0 are dropped.
 */
export function mergeEntries(
  base: readonly CollectionEntry[],
  local: readonly CollectionEntry[],
  remote: readonly CollectionEntry[],
): CollectionEntry[] {
  const maps = [base, local, remote].map((entries) => new Map(entries.map((entry) => [entry.printingId, entry])));
  const [baseById, localById, remoteById] = maps as [Map<string, CollectionEntry>, Map<string, CollectionEntry>, Map<string, CollectionEntry>];
  const ids = new Set(maps.flatMap((map) => [...map.keys()]));
  const merged: CollectionEntry[] = [];
  for (const printingId of ids) {
    const quantityOf = (map: Map<string, CollectionEntry>) => map.get(printingId)?.quantity ?? 0;
    const quantity = Math.max(0, quantityOf(localById) + quantityOf(remoteById) - quantityOf(baseById));
    if (quantity === 0) continue;
    const present = [baseById, localById, remoteById].flatMap((map) => map.get(printingId) ?? []);
    merged.push({
      printingId,
      quantity,
      firstAddedAt: present.map((entry) => entry.firstAddedAt).reduce((a, b) => (b < a ? b : a)),
      lastAddedAt: present.map((entry) => entry.lastAddedAt).reduce((a, b) => (b > a ? b : a)),
    });
  }
  return merged.sort(byPrintingId);
}

/**
 * Three-way merge of the synced settings (sync spec §3.2), setting by setting:
 * the side that changed since the base wins; if both did, the device wins.
 * A setting missing from the remote file counts as unchanged.
 */
export function mergeSettings(base: FileSettings, local: FileSettings, remote: Partial<FileSettings> | undefined): FileSettings {
  const merged: Record<string, unknown> = {};
  for (const key of Object.keys(fileSettingsSchema.shape) as (keyof FileSettings)[]) {
    const remoteValue = remote?.[key] ?? base[key];
    merged[key] = sameValue(local[key], base[key]) ? remoteValue : local[key];
  }
  return fileSettingsSchema.parse(merged);
}

/** The content after a sync: entries and settings merged with the base (sync spec §3.2). */
export function mergeCollections(base: SyncContent, local: SyncContent, remote: RemoteContent): SyncContent {
  return {
    entries: mergeEntries(base.entries, local.entries, remote.entries),
    settings: mergeSettings(base.settings, local.settings, remote.settings),
  };
}

/** Same entries (whatever their order) and same settings. */
export function sameContent(a: SyncContent, b: SyncContent): boolean {
  if (a.entries.length !== b.entries.length || !sameValue(a.settings, b.settings)) return false;
  const sortedA = [...a.entries].sort(byPrintingId);
  const sortedB = [...b.entries].sort(byPrintingId);
  return sortedA.every((entry, i) => {
    const other = sortedB[i]!;
    return (
      entry.printingId === other.printingId &&
      entry.quantity === other.quantity &&
      entry.firstAddedAt === other.firstAddedAt &&
      entry.lastAddedAt === other.lastAddedAt
    );
  });
}

function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

// ---------- First sync of a device (sync spec §3.3) ----------

/**
 * What the first sync of a device does, without a base yet. "ask": both
 * sides hold a collection and the user chooses (FirstSyncChoice). A remote
 * file without entries asks nothing: merging it changes no quantity.
 */
export type FirstSyncAction = "create" | "take-remote" | "keep-local" | "ask";

export function firstSyncAction(local: readonly CollectionEntry[], remote: RemoteContent | undefined): FirstSyncAction {
  if (!remote) return "create";
  if (local.length === 0) return "take-remote";
  if (remote.entries.length === 0) return "keep-local";
  return "ask";
}

export type FirstSyncChoice = "merge" | "keep-remote" | "keep-local";

/**
 * The content both sides hold after the first sync (sync spec §3.3).
 * Merge: the largest quantity of each printing, like the import, and the
 * device's settings. Keep remote: the file's entries, and its settings where
 * it has them. Keep local: the device's content.
 */
export function resolveFirstSync(choice: FirstSyncChoice, local: SyncContent, remote: RemoteContent): SyncContent {
  switch (choice) {
    case "keep-local":
      return { entries: [...local.entries].sort(byPrintingId), settings: local.settings };
    case "keep-remote":
      return { entries: [...remote.entries].sort(byPrintingId), settings: fileSettingsSchema.parse({ ...local.settings, ...remote.settings }) };
    case "merge": {
      const merged = new Map(local.entries.map((entry) => [entry.printingId, entry]));
      for (const entry of remote.entries) {
        const existing = merged.get(entry.printingId);
        merged.set(entry.printingId, existing ? mergeLargest(existing, entry) : { ...entry });
      }
      return { entries: [...merged.values()].sort(byPrintingId), settings: local.settings };
    }
  }
}

// ---------- Status (sync spec §5.3) ----------

/**
 * Errors that last until the next successful sync (sync spec §7). Network and
 * server errors are not kept: the changes simply stay pending.
 */
export const syncErrors = ["invalid-file", "storage-full", "revoked"] as const;
export type SyncError = (typeof syncErrors)[number];

export type SyncStatus = "disabled" | "up-to-date" | "pending" | "syncing" | "paused" | "error";

export interface SyncFacts {
  /** A Google account is connected on this device. */
  connected: boolean;
  /** The access token is still valid (sync spec §4.1). */
  tokenValid: boolean;
  syncing: boolean;
  lastError: SyncError | null;
  /** The local content differs from the base (syncHasLocalChanges). */
  localChanges: boolean;
}

/** The status shown to the user, derived from the facts rather than stored. */
export function syncStatus(facts: SyncFacts): SyncStatus {
  if (!facts.connected || facts.lastError === "revoked") return "disabled";
  if (facts.syncing) return "syncing";
  if (facts.lastError) return "error";
  if (!facts.tokenValid) return "paused";
  return facts.localChanges ? "pending" : "up-to-date";
}

/**
 * Local changes not yet sent (sync spec §5.3): deduced from the base, no flag
 * to maintain. Before the first sync, any collection counts as a change.
 */
export function syncHasLocalChanges(base: SyncContent | null, local: SyncContent): boolean {
  return base ? !sameContent(base, local) : local.entries.length > 0;
}

// ---------- State kept on the device ----------

const syncContentSchema = z.object({
  entries: z.array(collectionEntrySchema),
  settings: fileSettingsSchema,
});

/** What a device remembers about its sync (sync spec §6, SyncStore). */
export const syncStateSchema = z.object({
  provider: z.literal("google-drive"),
  /** E-mail of the connected account, shown in Settings. */
  account: z.string().nullable(),
  /** The remote file, once found or created. */
  fileId: z.string().nullable(),
  /** The content after the last successful sync; null before the first one (sync spec §3.2). */
  base: syncContentSchema.nullable(),
  /** The remote file's version at the last sync. */
  baseVersion: z.string().nullable(),
  lastSyncAt: z.string().nullable(),
  /** Access token and its expiry (sync spec §4.1); null once expired or revoked. */
  token: z.object({ value: z.string(), expiresAt: z.string() }).nullable(),
  lastError: z.enum(syncErrors).nullable(),
});

export type SyncState = z.infer<typeof syncStateSchema>;

/** The state right after connecting an account, before the first sync. */
export function connectedState(account: string | null, token: SyncState["token"]): SyncState {
  return { provider: "google-drive", account, fileId: null, base: null, baseVersion: null, lastSyncAt: null, token, lastError: null };
}

export function tokenValid(token: SyncState["token"], now: string): boolean {
  return token !== null && token.expiresAt > now;
}
