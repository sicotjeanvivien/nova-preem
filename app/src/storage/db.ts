import { Dexie, type EntityTable } from "dexie";
import type { CollectionEntry } from "../domain/collection.ts";

/** Key/value row, for the settings and catalog tables. */
export interface KeyValue {
  key: string;
  value: unknown;
}

/** The IndexedDB database `nova-preem` (docs/app-spec.md §4.2). */
export class NovaPreemDatabase extends Dexie {
  entries!: EntityTable<CollectionEntry, "printingId">;
  settings!: EntityTable<KeyValue, "key">;
  catalog!: EntityTable<KeyValue, "key">;
  sync!: EntityTable<KeyValue, "key">;

  constructor(name = "nova-preem") {
    super(name);
    this.version(1).stores({
      entries: "printingId",
      settings: "key",
      catalog: "key",
    });
    // Google Drive sync (docs/sync-spec.md §6). A new table: the existing data is untouched.
    this.version(2).stores({
      sync: "key",
    });
  }
}
