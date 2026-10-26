import { z } from "zod";
import { collectionEntrySchema, type CollectionEntry } from "./collection.ts";
import { settingsSchema, type Settings } from "./settings.ts";

// Export / import file of the collection (docs/app-spec.md §4.3), the future sync file.

export const COLLECTION_FORMAT = "nova-preem/collection";
export const COLLECTION_SCHEMA_VERSION = 1;

/** Settings saved in the file (spec §4.3 example): those that describe how the collection is entered and counted. */
const fileSettingsSchema = settingsSchema.pick({
  entryReleaseId: true,
  entryLanguage: true,
  duplicateThreshold: true,
  completionGroups: true,
  cardNameLanguage: true,
});

const collectionFileSchema = z.object({
  format: z.literal(COLLECTION_FORMAT),
  schemaVersion: z.literal(COLLECTION_SCHEMA_VERSION),
  exportedAt: z.string(),
  app: z.object({ version: z.string() }),
  catalog: z.object({ version: z.string() }),
  entries: z.array(collectionEntrySchema).refine((entries) => new Set(entries.map((e) => e.printingId)).size === entries.length, {
    message: "the same printing appears twice",
  }),
  settings: fileSettingsSchema.partial().optional(),
});

export type CollectionFile = z.infer<typeof collectionFileSchema>;

export function buildCollectionFile(input: {
  entries: readonly CollectionEntry[];
  settings: Settings;
  appVersion: string;
  catalogVersion: string;
  now: string;
}): CollectionFile {
  return {
    format: COLLECTION_FORMAT,
    schemaVersion: COLLECTION_SCHEMA_VERSION,
    exportedAt: input.now,
    app: { version: input.appVersion },
    catalog: { version: input.catalogVersion },
    // Sorted by printing: a stable file, readable diffs, simpler future sync (spec §4.3).
    entries: [...input.entries]
      .sort((a, b) => (a.printingId < b.printingId ? -1 : a.printingId > b.printingId ? 1 : 0))
      .map(({ printingId, quantity, firstAddedAt, lastAddedAt }) => ({ printingId, quantity, firstAddedAt, lastAddedAt })),
    settings: fileSettingsSchema.parse(input.settings),
  };
}

export function serializeCollectionFile(file: CollectionFile): string {
  return `${JSON.stringify(file, null, 2)}\n`;
}

/** "nova-preem-collection-2026-11-06.json" (spec §4.3). */
export function collectionFileName(now: string, extension = "json"): string {
  return `nova-preem-collection-${now.slice(0, 10)}.${extension}`;
}

export type ImportError = "not-json" | "unknown-format" | "unknown-version" | "invalid";

/**
 * Reads an export file. A file of another format or schema version is
 * refused with its own error, before any detailed validation (spec §4.3).
 */
export function parseCollectionFile(text: string): { ok: true; file: CollectionFile } | { ok: false; error: ImportError } {
  let json: unknown;
  try {
    json = JSON.parse(text.replace(/^﻿/, ""));
  } catch {
    return { ok: false, error: "not-json" };
  }
  const header = z.object({ format: z.unknown(), schemaVersion: z.unknown() }).safeParse(json);
  if (!header.success || header.data.format !== COLLECTION_FORMAT) return { ok: false, error: "unknown-format" };
  if (header.data.schemaVersion !== COLLECTION_SCHEMA_VERSION) return { ok: false, error: "unknown-version" };
  const file = collectionFileSchema.safeParse(json);
  return file.success ? { ok: true, file: file.data } : { ok: false, error: "invalid" };
}

export type ImportMode = "replace" | "merge";

export interface ImportPlan {
  /** The collection after the import. */
  entries: CollectionEntry[];
  added: number;
  modified: number;
  /** Entries of the current collection that disappear (replace only). */
  removed: number;
  /** Printings of the file unknown to the current catalog: kept, and reported (spec §4.3). */
  unknown: number;
}

/**
 * What an import does (spec §4.3). Replace: the collection becomes the file's.
 * Merge: for each printing, the largest quantity and the extreme dates.
 */
export function planImport(
  current: readonly CollectionEntry[],
  incoming: readonly CollectionEntry[],
  mode: ImportMode,
  isKnownPrinting: (printingId: string) => boolean,
): ImportPlan {
  const before = new Map(current.map((entry) => [entry.printingId, entry]));
  const after = new Map(mode === "replace" ? [] : before);
  for (const entry of incoming) {
    const existing = after.get(entry.printingId);
    after.set(
      entry.printingId,
      mode === "merge" && existing
        ? {
            printingId: entry.printingId,
            quantity: Math.max(existing.quantity, entry.quantity),
            firstAddedAt: existing.firstAddedAt < entry.firstAddedAt ? existing.firstAddedAt : entry.firstAddedAt,
            lastAddedAt: existing.lastAddedAt > entry.lastAddedAt ? existing.lastAddedAt : entry.lastAddedAt,
          }
        : { ...entry },
    );
  }
  const same = (a: CollectionEntry, b: CollectionEntry) =>
    a.quantity === b.quantity && a.firstAddedAt === b.firstAddedAt && a.lastAddedAt === b.lastAddedAt;
  let added = 0;
  let modified = 0;
  for (const [id, entry] of after) {
    const old = before.get(id);
    if (!old) added++;
    else if (!same(old, entry)) modified++;
  }
  return {
    entries: [...after.values()].sort((a, b) => (a.printingId < b.printingId ? -1 : 1)),
    added,
    modified,
    removed: [...before.keys()].filter((id) => !after.has(id)).length,
    unknown: incoming.filter((entry) => !isKnownPrinting(entry.printingId)).length,
  };
}
