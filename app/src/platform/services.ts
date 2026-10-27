import type { CatalogDependencies } from "../domain/catalogLoader.ts";
import type { CollectionStore, SettingsStore } from "../domain/stores.ts";
import packageJson from "../../package.json";
import { NovaPreemDatabase } from "../storage/db.ts";
import { DexieCatalogStore, DexieCollectionStore, DexieSettingsStore } from "../storage/dexieStores.ts";
import { HttpCatalogSource } from "./httpCatalogSource.ts";
import { webCryptoHasher } from "./webCryptoHasher.ts";

/** Everything the interface needs from the outside world, behind domain interfaces. */
export interface Services {
  catalog: CatalogDependencies;
  collection: CollectionStore;
  settings: SettingsStore;
  /** Base URL of card images (`printing.image.path` and `thumbPath` are relative to it). */
  imageBaseUrl: string;
  appVersion: string;
}

/** Browser wiring: IndexedDB (Dexie) for storage, HTTP for the catalog. */
export function createBrowserServices(): Services {
  const db = new NovaPreemDatabase();
  const catalogBaseUrl = import.meta.env.VITE_CATALOG_BASE_URL ?? "/catalog/";
  return {
    catalog: {
      store: new DexieCatalogStore(db),
      source: new HttpCatalogSource(catalogBaseUrl),
      hasher: webCryptoHasher,
    },
    collection: new DexieCollectionStore(db),
    settings: new DexieSettingsStore(db),
    imageBaseUrl: new URL("images/", new URL(catalogBaseUrl, globalThis.location.href)).href,
    appVersion: packageJson.version,
  };
}
