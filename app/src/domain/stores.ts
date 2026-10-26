import type { Catalog, CatalogManifest } from "./catalog.ts";
import type { CollectionEntry } from "./collection.ts";
import type { Settings } from "./settings.ts";

// Storage interfaces (docs/app-spec.md §9.1). The domain and the interface
// only know these; IndexedDB (Dexie) is one implementation among others.

export interface StoredCatalog {
  manifest: CatalogManifest;
  catalog: Catalog;
}

export interface CatalogStore {
  /** The catalog stored on the device, if any. */
  load(): Promise<StoredCatalog | undefined>;
  /** Replaces the stored catalog (catalog and manifest together). */
  save(stored: StoredCatalog): Promise<void>;
}

export interface CollectionStore {
  list(): Promise<CollectionEntry[]>;
  get(printingId: string): Promise<CollectionEntry | undefined>;
  /** Creates or replaces one entry. */
  put(entry: CollectionEntry): Promise<void>;
  remove(printingId: string): Promise<void>;
  /** Replaces the whole collection (import "Remplacer"). */
  replaceAll(entries: CollectionEntry[]): Promise<void>;
  /** Every entry, sorted by printingId (stable export file, spec §4.3). */
  exportAll(): Promise<CollectionEntry[]>;
}

export interface SettingsStore {
  /** Stored settings merged with the defaults. */
  load(): Promise<Settings>;
  update(changes: Partial<Settings>): Promise<Settings>;
}
