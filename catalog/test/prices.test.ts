import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Catalog } from "../src/model.ts";
import { parseMarketFiles, retainedPrice, type MarketSnapshot } from "../src/prices/cardmarket.ts";
import { parseMapping, type PriceMapping } from "../src/prices/mapping.ts";
import { matchPrices, nameKey } from "../src/prices/match.ts";
import { pricesFile, validatePricesFile } from "../src/prices/output.ts";
import { coverageProblem, PRICES_HEADERS } from "../src/prices/publish.ts";

const json = (path: string) => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));

/** Real extracts of the Cardmarket files of 16-17/11/2026 (game 23). */
const rawProducts = () => json("./fixtures/cardmarket/products-sample.json");
const rawPrices = () => json("./fixtures/cardmarket/price-guide-sample.json");

/** Names of the cards in the extracts. */
const SAMPLE_CARDS = ["Adam Smasher — Ender of Legends", "Tetratronic Rippler", "Rebecca — Having a Moment", "Swordwise Huscle"];

/** The real catalog, keeping every release but only the printings of the cards in the extracts. */
function sampleCatalog(): Catalog {
  const catalog = json("../dist/catalog.json") as Catalog;
  const cards = catalog.cards.filter((card) => SAMPLE_CARDS.includes(card.name.en ?? ""));
  const cardIds = new Set(cards.map((card) => card.id));
  const releases = new Set(["wnc-retail", "heist-starter-retail", "set1-promos", "arasaka-demo"]);
  return { ...catalog, cards, printings: catalog.printings.filter((p) => cardIds.has(p.cardId) && releases.has(p.releaseId)) };
}

function setup(change?: { mapping?: (mapping: PriceMapping) => void; market?: (market: MarketSnapshot) => void }) {
  const catalog = sampleCatalog();
  const mapping = parseMapping(json("../prices/cardmarket.json"), catalog);
  change?.mapping?.(mapping);
  const market = parseMarketFiles(rawProducts(), rawPrices(), mapping.category);
  change?.market?.(market);
  return { catalog, mapping, market, ...matchPrices(catalog, market, mapping) };
}

const priceOf = (result: ReturnType<typeof setup>, variantKey: string) => result.matches.find((m) => m.variantKey === variantKey);

describe("Cardmarket adapter", () => {
  it("keeps the single cards and their retained price, ISO dates", () => {
    const market = parseMarketFiles(rawProducts(), rawPrices(), 1661);
    expect(market.pricesDate).toBe("2026-11-17T02:51:32+01:00");
    expect(market.productsDate).toBe("2026-11-16T13:57:03+01:00");
    expect(market.products).toHaveLength(9);
    expect(market.products[0]).toEqual({ id: expect.any(Number), name: expect.any(String), expansionId: expect.any(Number) });
    // The sealed product (category 1672) is dropped.
    expect(market.prices.has(904771)).toBe(false);
    expect(market.prices.get(920416)).toBe(0.3); // trend
    expect(market.prices.get(920648)).toBe(64.85); // trend 0 → trend-foil
    expect(market.prices.has(905002)).toBe(false); // low only
    expect(market.prices.has(905261)).toBe(false); // nothing
  });

  it("retains trend, then trend-foil, never low", () => {
    expect(retainedPrice({ trend: 1.2, "trend-foil": 3 })).toBe(1.2);
    expect(retainedPrice({ trend: 0, "trend-foil": 3 })).toBe(3);
    expect(retainedPrice({ trend: null })).toBeNull();
    expect(retainedPrice({ trend: 0, "trend-foil": 0 })).toBeNull();
  });

  it("fails clearly when the format changes", () => {
    const products = rawProducts();
    delete products.products[0].idExpansion;
    expect(() => parseMarketFiles(products, rawPrices(), 1661)).toThrow(/liste des produits[\s\S]*idExpansion/);
    const prices = rawPrices();
    prices.priceGuides[1].trend = "0,30";
    expect(() => parseMarketFiles(rawProducts(), prices, 1661)).toThrow(/guide des prix[\s\S]*trend/);
    expect(() => parseMarketFiles(rawProducts(), { ...rawPrices(), version: 2 }, 1661)).toThrow(/guide des prix/);
  });
});

describe("matching", () => {
  it("normalizes names: dashes, accents, case", () => {
    expect(nameKey("Adam Smasher - Ender of Legends")).toBe(nameKey("Adam Smasher — Ender of Legends"));
    expect(nameKey("Évelyn Parker")).toBe("evelynparker");
  });

  it("matches a group of the same name in order: idProduct ↔ collector number", () => {
    const result = setup();
    // Adam Smasher: the Legend (#001) and its Iconic (#141), much more expensive.
    expect(priceOf(result, "wnc-retail#001")).toEqual({ variantKey: "wnc-retail#001", productId: 920398, price: 0.8 });
    expect(priceOf(result, "wnc-retail#141")).toEqual({ variantKey: "wnc-retail#141", productId: 920648, price: 64.85 });
    expect(result.report.summary.duplicateGroups).toBe(1);
    expect(result.report.iconicCheckFailures).toEqual([]);
  });

  it("applies the name aliases (Tetratonic Rippler)", () => {
    const result = setup();
    expect(priceOf(result, "heist-starter-retail#018")).toMatchObject({ productId: 920416, price: 0.3 });
    // The correct spelling, in the main release.
    expect(priceOf(result, "wnc-retail#130")).toMatchObject({ productId: 920637, price: 0.04 });
    expect(result.report.aliases).toEqual([{ from: "Tetratonic Rippler", to: "Tetratronic Rippler", products: 1 }]);
  });

  it("keeps a matched variant without a price", () => {
    const result = setup();
    const swordwise = result.matches.find((m) => m.productId === 905002);
    expect(swordwise?.variantKey).toMatch(/^arasaka-demo#/);
    expect(swordwise?.price).toBeNull();
    expect(result.report.summary.withoutPrice).toBeGreaterThan(0);
  });

  it("does not match a name whose counts differ, and reports it", () => {
    const result = setup();
    // Rebecca 005 and 007 are one product on Cardmarket.
    expect(result.report.unmatchedNames).toContainEqual({
      releaseId: "set1-promos",
      expansionId: 6719,
      name: "Rebecca — Having a Moment",
      printings: 2,
      products: 1,
      variantKeys: ["set1-promos#005", "set1-promos#007"],
      productIds: [904772],
    });
    expect(priceOf(result, "set1-promos#005")).toBeUndefined();
  });

  it("lets an override win and resolve a reported case", () => {
    const result = setup({ mapping: (m) => (m.overrides = { "set1-promos#005": 904772, "set1-promos#007": 904772 }) });
    expect(priceOf(result, "set1-promos#005")).toMatchObject({ productId: 904772, price: 78.25 });
    expect(priceOf(result, "set1-promos#007")).toMatchObject({ productId: 904772 });
    expect(result.report.unmatchedNames.find((u) => u.name.startsWith("Rebecca"))).toBeUndefined();
    expect(result.report.overrides).toHaveLength(2);
  });

  it("reports an Iconic cheaper than its normal version, without removing it", () => {
    const result = setup({ market: (m) => m.prices.set(920648, 0.5) });
    expect(result.report.iconicCheckFailures).toEqual([
      {
        releaseId: "wnc-retail",
        name: "Adam Smasher — Ender of Legends",
        iconic: { variantKey: "wnc-retail#141", productId: 920648, price: 0.5 },
        normal: { variantKey: "wnc-retail#001", productId: 920398, price: 0.8 },
      },
    ]);
    expect(priceOf(result, "wnc-retail#141")?.price).toBe(0.5);
  });

  it("reports ignored expansions, unknown expansions and releases without expansion", () => {
    const result = setup({ market: (m) => m.products.push({ id: 999999, name: "New Promo Card", expansionId: 7000 }) });
    expect(result.report.ignoredExpansions).toEqual([{ expansionId: 6722, reason: "cartes Kickstarter absentes du catalogue", products: 2 }]);
    expect(result.report.orphanProducts).toEqual([{ productId: 999999, name: "New Promo Card", expansionId: 7000, reason: "unknown-expansion" }]);
    expect(result.report.releasesWithoutExpansion.map((r) => r.releaseId)).toEqual(["edgerunner-open-s1"]);
  });

  it("reports a product whose name is not in its release", () => {
    const result = setup({ market: (m) => m.products.push({ id: 999998, name: "Unknown Card", expansionId: 6761 }) });
    expect(result.report.orphanProducts).toEqual([{ productId: 999998, name: "Unknown Card", expansionId: 6761, reason: "name-not-in-release" }]);
  });
});

describe("mapping", () => {
  it("rejects releases or variants unknown to the catalog", () => {
    const catalog = sampleCatalog();
    const raw = json("../prices/cardmarket.json");
    expect(() => parseMapping({ ...raw, expansions: { ...raw.expansions, "nope-release": 1 } }, catalog)).toThrow(/nope-release/);
    expect(() => parseMapping({ ...raw, overrides: { "wnc-retail#999": 1 } }, catalog)).toThrow(/wnc-retail#999/);
    expect(() => parseMapping({ ...raw, extra: true }, catalog)).toThrow(/cardmarket.json invalide/);
  });
});

describe("prices.json", () => {
  const info = { sourceDate: "2026-11-17T02:51:32+01:00", generatedAt: "2026-11-17T04:10:00.000Z", catalogVersion: "2026-11-04.2" };

  it("has the variant key → euros of the priced variants only", () => {
    const file = pricesFile(setup(), info);
    expect(file).toMatchObject({ schemaVersion: 1, source: "cardmarket", currency: "EUR", ...info });
    expect(file.prices["wnc-retail#001"]).toBe(0.8);
    expect(file.prices["wnc-retail#141"]).toBe(64.85);
    expect(Object.keys(file.prices).some((key) => key.startsWith("arasaka-demo#"))).toBe(false);
  });

  it("rounds to two decimals", () => {
    const file = pricesFile(setup({ market: (m) => m.prices.set(920416, 0.30499999) }), info);
    expect(file.prices["heist-starter-retail#018"]).toBe(0.3);
  });

  it("refuses a broken file", () => {
    expect(() => validatePricesFile({ ...pricesFile(setup(), info), prices: { "wnc-retail#001": -1 } })).toThrow(/prices.json invalide/);
    expect(() => validatePricesFile({ ...pricesFile(setup(), info), catalogVersion: "" })).toThrow(/catalogVersion/);
  });
});

describe("publication guard", () => {
  it("publishes when there is no previous publication", () => {
    expect(coverageProblem({ matched: 534 }, null)).toBeNull();
  });

  it("refuses a coverage under 80 % of the previous publication", () => {
    expect(coverageProblem({ matched: 534 }, { matched: 534 })).toBeNull();
    expect(coverageProblem({ matched: 428 }, { matched: 534 })).toBeNull(); // 427.2 → 428
    expect(coverageProblem({ matched: 427 }, { matched: 534 })).toMatch(/427 variantes rattachées, contre 534.*minimum 428/);
    expect(coverageProblem({ matched: 0 }, { matched: 534 })).not.toBeNull();
  });

  it("serves the file with open CORS and one hour of cache", () => {
    expect(PRICES_HEADERS).toContain("Access-Control-Allow-Origin: *");
    expect(PRICES_HEADERS).toContain("Cache-Control: public, max-age=3600");
  });
});
