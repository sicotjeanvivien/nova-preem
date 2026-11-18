import type { PricesFile, PriceSource } from "../src/domain/prices.ts";
import type { PriceStore, StoredPrices } from "../src/domain/stores.ts";

/** A prices.json as published by the pipeline (real prices of 17/11/2026). */
export const PRICES_FILE: PricesFile = {
  schemaVersion: 1,
  source: "cardmarket",
  currency: "EUR",
  sourceDate: "2026-11-17T02:51:32+01:00",
  generatedAt: "2026-11-17T03:35:00.000Z",
  catalogVersion: "2026-11-04.2",
  prices: { "wnc-retail#001": 0.8, "wnc-retail#141": 64.85, "wnc-retail#003": 14.2 },
};

export class MemoryPriceStore implements PriceStore {
  saves = 0;
  constructor(public stored?: StoredPrices) {}

  async load() {
    return this.stored;
  }

  async save(value: StoredPrices) {
    this.stored = value;
    this.saves++;
  }
}

/** A price source that counts its downloads. */
export function fakePriceSource(file: unknown = PRICES_FILE): PriceSource & { downloads: number } {
  const source = {
    downloads: 0,
    async download() {
      source.downloads++;
      return file;
    },
  };
  return source;
}
