import { catalogSchema, manifestSchema } from "./catalog.ts";
import type { CatalogStore, StoredCatalog } from "./stores.ts";

/** Where the catalog is downloaded from (HTTP in the browser, anything in tests). */
export interface CatalogSource {
  fetchManifest(): Promise<unknown>;
  /** Raw text of catalog.json; `onProgress` receives a fraction in [0, 1], or null if unknown. */
  fetchCatalog(onProgress: (fraction: number | null) => void): Promise<string>;
}

export interface Hasher {
  /** "sha256:<hex>" of the UTF-8 encoding of `text`, as in manifest.json. */
  sha256(text: string): Promise<string>;
}

export type CatalogErrorCode = "network" | "invalid" | "integrity";

export class CatalogError extends Error {
  readonly code: CatalogErrorCode;

  constructor(code: CatalogErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "CatalogError";
    this.code = code;
  }
}

export interface CatalogDependencies {
  store: CatalogStore;
  source: CatalogSource;
  hasher: Hasher;
}

/**
 * First launch (spec §6): downloads manifest.json then catalog.json, checks the
 * catalog against the manifest (hash and counts) and its format, then stores it.
 * Nothing is stored if any check fails.
 */
export async function downloadCatalog(
  { store, source, hasher }: CatalogDependencies,
  onProgress: (fraction: number | null) => void = () => {},
): Promise<StoredCatalog> {
  let rawManifest: unknown;
  let text: string;
  try {
    rawManifest = await source.fetchManifest();
    text = await source.fetchCatalog(onProgress);
  } catch (error) {
    throw new CatalogError("network", "The catalog could not be downloaded", { cause: error });
  }

  const manifest = manifestSchema.safeParse(rawManifest);
  if (!manifest.success) throw new CatalogError("invalid", "manifest.json has an unexpected format", { cause: manifest.error });

  if ((await hasher.sha256(text)) !== manifest.data.hash) {
    throw new CatalogError("integrity", "catalog.json does not match its manifest (hash)");
  }

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (error) {
    throw new CatalogError("invalid", "catalog.json is not valid JSON", { cause: error });
  }
  const catalog = catalogSchema.safeParse(json);
  if (!catalog.success) throw new CatalogError("invalid", "catalog.json has an unexpected format", { cause: catalog.error });

  const { counts } = manifest.data;
  if (catalog.data.cards.length !== counts.cards || catalog.data.printings.length !== counts.printings) {
    throw new CatalogError("integrity", "catalog.json does not match its manifest (counts)");
  }

  const stored = { manifest: manifest.data, catalog: catalog.data };
  await store.save(stored);
  onProgress(1);
  return stored;
}
