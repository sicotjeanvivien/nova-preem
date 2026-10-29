import { z } from "zod";
import { collectionEntrySchema, type CollectionEntry } from "./collection.ts";
import { fileSettingsSchema, mergeLargest, planImport, type FileSettings } from "./collectionFile.ts";

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
  settings?: RemoteSettings | undefined;
}

export type RemoteSettings = { [K in keyof FileSettings]?: FileSettings[K] | undefined };

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
export function mergeSettings(base: FileSettings, local: FileSettings, remote: RemoteSettings | undefined): FileSettings {
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
  return changeCount(a, b) === 0;
}

/**
 * Number of differences between two contents: each printing whose entry
 * differs (added, removed, or changed) and each setting that differs.
 */
function changeCount(a: SyncContent, b: SyncContent): number {
  const aById = new Map(a.entries.map((entry) => [entry.printingId, entry]));
  const bById = new Map(b.entries.map((entry) => [entry.printingId, entry]));
  let count = 0;
  for (const printingId of new Set([...aById.keys(), ...bById.keys()])) {
    const x = aById.get(printingId);
    const y = bById.get(printingId);
    if (!x || !y || x.quantity !== y.quantity || x.firstAddedAt !== y.firstAddedAt || x.lastAddedAt !== y.lastAddedAt) count++;
  }
  for (const key of Object.keys(fileSettingsSchema.shape) as (keyof FileSettings)[]) {
    if (!sameValue(a.settings[key], b.settings[key])) count++;
  }
  return count;
}

/** The settings the remote file actually holds. */
function definedOnly(settings: RemoteSettings | undefined): Partial<FileSettings> {
  return Object.fromEntries(Object.entries(settings ?? {}).filter(([, value]) => value !== undefined));
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
      return { entries: [...remote.entries].sort(byPrintingId), settings: fileSettingsSchema.parse({ ...local.settings, ...definedOnly(remote.settings) }) };
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

/** What one side gains and loses (the import summary, sync spec §3.3). */
export interface SideChanges {
  added: number;
  modified: number;
  removed: number;
}

export interface FirstSyncPlan {
  result: SyncContent;
  device: SideChanges;
  drive: SideChanges;
  /** Printings of the result unknown to the current catalog: kept, and reported. */
  unknown: number;
}

/** The first sync's choice and its summary on each side (SyncFirst mockups). */
export function planFirstSync(
  choice: FirstSyncChoice,
  local: SyncContent,
  remote: RemoteContent,
  isKnownPrinting: (printingId: string) => boolean,
): FirstSyncPlan {
  const result = resolveFirstSync(choice, local, remote);
  const changes = (before: readonly CollectionEntry[]): SideChanges => {
    const { added, modified, removed } = planImport(before, result.entries, "replace", isKnownPrinting);
    return { added, modified, removed };
  };
  return {
    result,
    device: changes(local.entries),
    drive: changes(remote.entries),
    unknown: result.entries.filter((entry) => !isKnownPrinting(entry.printingId)).length,
  };
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
  /** Local changes not yet sent (pendingChangeCount). */
  pendingChanges: number;
}

/** The status shown to the user, derived from the facts rather than stored. */
export function syncStatus(facts: SyncFacts): SyncStatus {
  if (!facts.connected || facts.lastError === "revoked") return "disabled";
  if (facts.syncing) return "syncing";
  if (facts.lastError) return "error";
  if (!facts.tokenValid) return "paused";
  return facts.pendingChanges > 0 ? "pending" : "up-to-date";
}

/**
 * Number of local changes not yet sent (sync spec §5.3, "En attente · 3"):
 * deduced from the base, no flag to maintain. A change is a printing whose
 * entry differs from the base, or a synced setting. Before the first sync,
 * each entry of the collection counts.
 */
export function pendingChangeCount(base: SyncContent | null, local: SyncContent): number {
  return base ? changeCount(base, local) : local.entries.length;
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
  /** Warning of the last sync, shown in Settings (sync spec §7): file recreated, other files left untouched. */
  notice: z
    .discriminatedUnion("kind", [z.object({ kind: z.literal("recreated") }), z.object({ kind: z.literal("other-files"), count: z.number().int().min(1) })])
    .nullable(),
});

export type SyncState = z.infer<typeof syncStateSchema>;

/** The state right after connecting an account, before the first sync. */
export function connectedState(account: string | null, token: SyncState["token"]): SyncState {
  return { provider: "google-drive", account, fileId: null, base: null, baseVersion: null, lastSyncAt: null, token, lastError: null, notice: null };
}

export function tokenValid(token: SyncState["token"], now: string): boolean {
  return token !== null && token.expiresAt > now;
}
