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

/** Real prices of 17/11/2026 for the variants of the demonstration collection (subset of prices.json). */
export const DEMO_PRICES: Record<string, number> = {
  "wnc-retail#003": 14.04,
  "wnc-retail#008": 0.04,
  "wnc-retail#011": 11.57,
  "wnc-retail#014": 0.2,
  "wnc-retail#017": 0.04,
  "wnc-retail#020": 1.22,
  "wnc-retail#025": 0.07,
  "wnc-retail#048": 3.63,
  "wnc-retail#053": 0.08,
  "wnc-retail#141": 64.85,
  "wnc-retail#144": 70.07,
  "wnc-beta#141": 123.27,
  "embracing-power-starter-retail#002": 0.2,
  "night-city-brawl-s1#001": 4.72,
};

export const DEMO_PRICES_FILE: PricesFile = { ...PRICES_FILE, prices: DEMO_PRICES };

/**
 * The demonstration collection: the cards of the Collection mockup, plus an
 * Iconic, a Beta, a promo and two cards without a price.
 * [variant key, language, quantity].
 */
export const DEMO_COLLECTION: [string, string, number][] = [
  ["wnc-retail#144", "fr", 1],
  ["wnc-retail#008", "fr", 3],
  ["wnc-retail#025", "fr", 2],
  ["wnc-retail#025", "en", 1],
  ["wnc-retail#003", "fr", 1],
  ["wnc-retail#020", "fr", 1],
  ["wnc-retail#053", "fr", 3],
  ["wnc-retail#048", "fr", 1],
  ["wnc-retail#014", "fr", 1],
  ["wnc-retail#014", "en", 1],
  ["wnc-retail#017", "fr", 2],
  ["wnc-retail#141", "fr", 1],
  ["wnc-beta#141", "en", 1],
  ["embracing-power-starter-retail#002", "en", 1],
  ["night-city-brawl-s1#001", "en", 1],
  ["edgerunner-open-s1#001", "en", 2],
  ["set1-promos#005", "en", 1],
];
