import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import type { CatalogSource, Hasher } from "../src/domain/catalogLoader.ts";
import type { CatalogStore, StoredCatalog } from "../src/domain/stores.ts";

const CATALOG_DIST = new URL("../../catalog/dist/", import.meta.url);

/** The real catalog produced by the pipeline (catalog/dist/), as served to the app. */
export const realCatalogText = readFileSync(new URL("catalog.json", CATALOG_DIST), "utf8");
export const realManifest = JSON.parse(readFileSync(new URL("manifest.json", CATALOG_DIST), "utf8"));

export const nodeHasher: Hasher = {
  async sha256(text) {
    return `sha256:${createHash("sha256").update(text, "utf8").digest("hex")}`;
  },
};

export class MemoryCatalogStore implements CatalogStore {
  stored: StoredCatalog | undefined;
  saves = 0;

  async load() {
    return this.stored;
  }

  async save(stored: StoredCatalog) {
    this.stored = stored;
    this.saves++;
  }
}

export function fakeSource(options: { manifest?: unknown; catalogText?: string; fail?: boolean } = {}): CatalogSource {
  return {
    async fetchManifest() {
      if (options.fail) throw new TypeError("Failed to fetch");
      return options.manifest ?? realManifest;
    },
    async fetchCatalog(onProgress) {
      onProgress(0);
      onProgress(0.5);
      return options.catalogText ?? realCatalogText;
    },
  };
}
