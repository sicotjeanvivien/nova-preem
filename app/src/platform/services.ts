import type { CatalogDependencies } from "../domain/catalogLoader.ts";
import type { CollectionStore, SettingsStore, SyncStore } from "../domain/stores.ts";
import type { RemoteFileProvider, SyncAuth } from "../domain/syncEngine.ts";
import packageJson from "../../package.json";
import { NovaPreemDatabase } from "../storage/db.ts";
import { DexieCatalogStore, DexieCollectionStore, DexieSettingsStore, DexieSyncStore } from "../storage/dexieStores.ts";
import { GoogleAuth } from "./googleAuth.ts";
import { driveFileUrl, GoogleDriveFiles } from "./googleDrive.ts";
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
  /** Google Drive sync (docs/sync-spec.md); null when the build has no Google client ID. */
  sync: SyncServices | null;
}

export interface SyncServices {
  store: SyncStore;
  auth: SyncAuth;
  /** The remote file provider, for one access token. */
  remote(token: string): RemoteFileProvider;
  /** Link to the file, to open it in the provider's site. */
  fileUrl(fileId: string): string;
}

/** Browser wiring: IndexedDB (Dexie) for storage, HTTP for the catalog. */
export function createBrowserServices(): Services {
  const db = new NovaPreemDatabase();
  const catalogBaseUrl = import.meta.env.VITE_CATALOG_BASE_URL ?? "/catalog/";
  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || null;
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
    sync: googleClientId
      ? { store: new DexieSyncStore(db), auth: new GoogleAuth(googleClientId), remote: (token) => new GoogleDriveFiles(token), fileUrl: driveFileUrl }
      : null,
  };
}
