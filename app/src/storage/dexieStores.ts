import type { Catalog, CatalogManifest } from "../domain/catalog.ts";
import type { CollectionEntry } from "../domain/collection.ts";
import { DEFAULT_SETTINGS, settingsSchema, type Settings } from "../domain/settings.ts";
import type { CatalogStore, CollectionStore, SettingsStore, StoredCatalog, SyncStore } from "../domain/stores.ts";
import { syncStateSchema, type SyncState } from "../domain/sync.ts";
import type { NovaPreemDatabase } from "./db.ts";

// IndexedDB implementations of the domain storage interfaces.

export class DexieCatalogStore implements CatalogStore {
  constructor(private readonly db: NovaPreemDatabase) {}

  async load(): Promise<StoredCatalog | undefined> {
    const [manifest, catalog] = await this.db.catalog.bulkGet(["manifest", "catalog"]);
    if (!manifest || !catalog) return undefined;
    return { manifest: manifest.value as CatalogManifest, catalog: catalog.value as Catalog };
  }

  async save({ manifest, catalog }: StoredCatalog): Promise<void> {
    await this.db.transaction("rw", this.db.catalog, () =>
      this.db.catalog.bulkPut([
        { key: "catalog", value: catalog },
        { key: "manifest", value: manifest },
      ]),
    );
  }
}

export class DexieCollectionStore implements CollectionStore {
  constructor(private readonly db: NovaPreemDatabase) {}

  list(): Promise<CollectionEntry[]> {
    return this.db.entries.toArray();
  }

  get(printingId: string): Promise<CollectionEntry | undefined> {
    return this.db.entries.get(printingId);
  }

  async put(entry: CollectionEntry): Promise<void> {
    await this.db.entries.put(entry);
  }

  async remove(printingId: string): Promise<void> {
    await this.db.entries.delete(printingId);
  }

  async replaceAll(entries: CollectionEntry[]): Promise<void> {
    await this.db.transaction("rw", this.db.entries, async () => {
      await this.db.entries.clear();
      await this.db.entries.bulkAdd(entries);
    });
  }

  exportAll(): Promise<CollectionEntry[]> {
    // The primary key is printingId: the table is already sorted by it.
    return this.db.entries.orderBy("printingId").toArray();
  }
}

export class DexieSettingsStore implements SettingsStore {
  constructor(private readonly db: NovaPreemDatabase) {}

  /** One row per setting; unknown or invalid stored values fall back to the defaults. */
  async load(): Promise<Settings> {
    const rows = await this.db.settings.toArray();
    const stored = Object.fromEntries(rows.map((row) => [row.key, row.value]));
    const settings: Record<string, unknown> = { ...DEFAULT_SETTINGS };
    const shape = settingsSchema.shape;
    for (const key of Object.keys(shape) as (keyof Settings)[]) {
      if (!(key in stored)) continue;
      const parsed = shape[key].safeParse(stored[key]);
      if (parsed.success) settings[key] = parsed.data;
    }
    return settingsSchema.parse(settings);
  }

  async update(changes: Partial<Settings>): Promise<Settings> {
    const validated = settingsSchema.partial().parse(changes);
    await this.db.settings.bulkPut(Object.entries(validated).map(([key, value]) => ({ key, value })));
    return this.load();
  }
}

export class DexieSyncStore implements SyncStore {
  constructor(private readonly db: NovaPreemDatabase) {}

  /** A single row; an invalid stored state is ignored, as if sync were off. */
  async load(): Promise<SyncState | undefined> {
    const row = await this.db.sync.get("state");
    const parsed = syncStateSchema.safeParse(row?.value);
    return parsed.success ? parsed.data : undefined;
  }

  async save(state: SyncState): Promise<void> {
    await this.db.sync.put({ key: "state", value: syncStateSchema.parse(state) });
  }

  async clear(): Promise<void> {
    await this.db.sync.clear();
  }
}
