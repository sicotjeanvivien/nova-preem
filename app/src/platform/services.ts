import type { CatalogDependencies } from "../domain/catalogLoader.ts";
import type { CollectionStore, SettingsStore } from "../domain/stores.ts";
import { NovaPreemDatabase } from "../storage/db.ts";
import { DexieCatalogStore, DexieCollectionStore, DexieSettingsStore } from "../storage/dexieStores.ts";
import { HttpCatalogSource } from "./httpCatalogSource.ts";
import { webCryptoHasher } from "./webCryptoHasher.ts";

/** Everything the interface needs from the outside world, behind domain interfaces. */
export interface Services {
  catalog: CatalogDependencies;
  collection: CollectionStore;
  settings: SettingsStore;
}

/** Browser wiring: IndexedDB (Dexie) for storage, HTTP for the catalog. */
export function createBrowserServices(): Services {
  const db = new NovaPreemDatabase();
  return {
    catalog: {
      store: new DexieCatalogStore(db),
      source: new HttpCatalogSource(import.meta.env.VITE_CATALOG_BASE_URL ?? "/catalog/"),
      hasher: webCryptoHasher,
    },
    collection: new DexieCollectionStore(db),
    settings: new DexieSettingsStore(db),
  };
}
