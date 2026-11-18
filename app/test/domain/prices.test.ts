import { describe, expect, it } from "vitest";
import type { Printing, Release } from "../../src/domain/catalog.ts";
import {
  arePricesOld,
  collectionValue,
  collectionValueByRelease,
  mostValuable,
  downloadPrices,
  formatPrice,
  formatTotal,
  isPriceRefreshDue,
  pricesFileSchema,
  releaseValue,
  roundPrice,
  roundTotal,
  valueOf,
} from "../../src/domain/prices.ts";
import type { StoredPrices } from "../../src/domain/stores.ts";
import { MemoryPriceStore, PRICES_FILE } from "../helpers-prices.ts";

/** Non-breaking spaces written as plain spaces, for readable expectations. */
const plain = (text: string) => text.replace(/ /g, " ");


describe("price of a card", () => {
  it.each([
    [undefined, { kind: "none" }],
    [0, { kind: "none" }],
    [0.01, { kind: "below" }],
    [0.09, { kind: "below" }],
    [0.099, { kind: "below" }],
    [0.1, { kind: "approx", value: 0.1 }],
    [0.14, { kind: "approx", value: 0.1 }],
    [0.15, { kind: "approx", value: 0.2 }],
    [0.35, { kind: "approx", value: 0.4 }],
    [0.94, { kind: "approx", value: 0.9 }],
    [0.96, { kind: "approx", value: 1 }],
    [0.99, { kind: "approx", value: 1 }],
    [1, { kind: "approx", value: 1 }],
    [1.24, { kind: "approx", value: 1 }],
    [1.25, { kind: "approx", value: 1.5 }],
    [2.6, { kind: "approx", value: 2.5 }],
    [9.74, { kind: "approx", value: 9.5 }],
    [9.75, { kind: "approx", value: 10 }],
    [9.99, { kind: "approx", value: 10 }],
    [10, { kind: "approx", value: 10 }],
    [10.49, { kind: "approx", value: 10 }],
    [10.5, { kind: "approx", value: 11 }],
    [64.85, { kind: "approx", value: 65 }],
    [99.49, { kind: "approx", value: 99 }],
    [99.5, { kind: "approx", value: 100 }],
    [100, { kind: "approx", value: 100 }],
    [104.99, { kind: "approx", value: 100 }],
    [105, { kind: "approx", value: 110 }],
    [338, { kind: "approx", value: 340 }],
    [1300, { kind: "approx", value: 1300 }],
  ] as const)("%s € → %j", (price, expected) => {
    expect(roundPrice(price)).toEqual(expected);
  });

  it.each([
    [undefined, "—", "—"],
    [0.05, "< 0,10 €", "< €0.10"],
    [0.3, "≈ 0,30 €", "≈ €0.30"],
    [0.96, "≈ 1,00 €", "≈ €1.00"],
    [2.6, "≈ 2,50 €", "≈ €2.50"],
    [9.8, "≈ 10 €", "≈ €10"],
    [64.85, "≈ 65 €", "≈ €65"],
    [338, "≈ 340 €", "≈ €340"],
    [1300, "≈ 1 300 €", "≈ €1,300"],
  ])("%s € is shown as %s / %s", (price, french, english) => {
    expect(plain(formatPrice(price, "fr"))).toBe(french);
    expect(plain(formatPrice(price, "en"))).toBe(english);
  });

  it("keeps the amount on one line", () => {
    expect(formatPrice(0.3, "fr")).toBe("≈ 0,30 €");
  });
});

describe("total", () => {
  it.each([
    [0, 0],
    [0.49, 0],
    [0.5, 1],
    [42.4, 42],
    [99.49, 99],
    [99.5, 100],
    [100, 100],
    [104.99, 100],
    [105, 110],
    [994.99, 990],
    [995, 1000],
    [999.99, 1000],
    [1000, 1000],
    [1024.99, 1000],
    [1025, 1050],
    [1249, 1250],
    [2_118.4, 2100],
  ])("%s € → %s €", (total, expected) => {
    expect(roundTotal(total)).toBe(expected);
  });

  it.each([
    [0, "≈ 0 €", "≈ €0"],
    [0.3, "< 1 €", "< €1"],
    [89.6, "≈ 90 €", "≈ €90"],
    [1249, "≈ 1 250 €", "≈ €1,250"],
    [12_345, "≈ 12 350 €", "≈ €12,350"],
  ])("%s € is shown as %s / %s", (total, french, english) => {
    expect(plain(formatTotal(total, "fr"))).toBe(french);
    expect(plain(formatTotal(total, "en"))).toBe(english);
  });
});

describe("values", () => {
  const prices = PRICES_FILE.prices;

  it("sums the real prices × quantities, cards without a price apart", () => {
    const value = valueOf(
      [
        { variantKey: "wnc-retail#001", quantity: 3 },
        { variantKey: "wnc-retail#141", quantity: 1 },
        { variantKey: "edgerunner-open-s1#001", quantity: 2 },
        { variantKey: "wnc-retail#003", quantity: 0 },
      ],
      prices,
    );
    expect(value.total).toBeCloseTo(0.8 * 3 + 64.85);
    expect(value).toMatchObject({ priced: 4, unpriced: 2 });
  });

  it("values a collection: every language of a variant shares its price", () => {
    const printing = (id: string, variantKey: string) => [id, { id, variantKey } as Printing] as const;
    const printings = new Map([printing("en-001", "wnc-retail#001"), printing("fr-001", "wnc-retail#001"), printing("fr-999", "set1-promos#999")]);
    const quantities = new Map([
      ["en-001", 1],
      ["fr-001", 2],
      ["fr-999", 1],
      ["unknown-printing", 5],
    ]);
    const value = collectionValue(quantities, printings, prices);
    expect(value.total).toBeCloseTo(2.4);
    expect(value).toMatchObject({ priced: 3, unpriced: 1 });
  });

  it("values a complete release: one copy of each variant", () => {
    const value = releaseValue([{ key: "wnc-retail#001" }, { key: "wnc-retail#141" }, { key: "wnc-retail#002" }], prices);
    expect(value.total).toBeCloseTo(65.65);
    expect(value).toMatchObject({ priced: 2, unpriced: 1 });
  });
});

describe("loading", () => {
  const stored = (downloadedAt: string): StoredPrices => ({ file: PRICES_FILE, downloadedAt });
  const now = new Date("2026-11-18T12:00:00.000Z");

  it("downloads again prices more than 12 hours old", () => {
    expect(isPriceRefreshDue(undefined, now)).toBe(true);
    expect(isPriceRefreshDue(stored("2026-11-18T00:00:01.000Z"), now)).toBe(false);
    expect(isPriceRefreshDue(stored("2026-11-18T00:00:00.000Z"), now)).toBe(true);
  });

  it("calls prices of more than 7 days old", () => {
    expect(arePricesOld({ sourceDate: "2026-11-17T02:51:32+01:00" }, now)).toBe(false);
    expect(arePricesOld({ sourceDate: "2026-11-11T13:00:00Z" }, now)).toBe(false);
    expect(arePricesOld({ sourceDate: "2026-11-11T11:59:59Z" }, now)).toBe(true);
  });


  it("validates and stores the downloaded file", async () => {
    const store = new MemoryPriceStore();
    const result = await downloadPrices({ store, source: { download: async () => PRICES_FILE } }, now);
    expect(result).toEqual({ file: PRICES_FILE, downloadedAt: "2026-11-18T12:00:00.000Z" });
    expect(store.stored).toEqual(result);
  });

  it("keeps the stored prices when the file is invalid or the download fails", async () => {
    const store = new MemoryPriceStore();
    store.stored = stored("2026-11-10T00:00:00.000Z");
    const before = store.stored;
    await expect(downloadPrices({ store, source: { download: async () => ({ ...PRICES_FILE, prices: { "wnc-retail#001": -1 } }) } }, now)).rejects.toThrow(
      /unexpected format/,
    );
    await expect(downloadPrices({ store, source: { download: async () => ({ ...PRICES_FILE, schemaVersion: 2 }) } }, now)).rejects.toThrow();
    await expect(
      downloadPrices(
        {
          store,
          source: {
            download: async () => {
              throw new TypeError("Failed to fetch");
            },
          },
        },
        now,
      ),
    ).rejects.toThrow("Failed to fetch");
    expect(store.stored).toBe(before);
  });

  it("accepts the file published by the pipeline", () => {
    expect(pricesFileSchema.safeParse(PRICES_FILE).success).toBe(true);
  });
});

describe("Stats detail", () => {
  const printing = (id: string, variantKey: string, releaseId: string, language = "fr") =>
    [id, { id, variantKey, releaseId, language } as Printing] as const;
  const printings = new Map([
    printing("r1", "wnc-retail#001", "wnc-retail"),
    printing("r141", "wnc-retail#141", "wnc-retail"),
    printing("r141en", "wnc-retail#141", "wnc-retail", "en"),
    printing("b141", "wnc-beta#141", "wnc-beta", "en"),
    printing("s2", "embracing-power-starter-retail#002", "embracing-power-starter-retail"),
    printing("h18", "heist-starter-retail#018", "heist-starter-retail"),
    printing("p1", "set1-promos#005", "set1-promos"),
  ]);
  const release = (id: string, group: string, order: number) => [id, { id, group, order } as Release] as const;
  const releases = new Map([
    release("wnc-retail", "main", 1),
    release("wnc-beta", "main", 2),
    release("embracing-power-starter-retail", "starter", 5),
    release("heist-starter-retail", "starter", 3),
    release("set1-promos", "promo", 20),
  ]);
  const prices = { "wnc-retail#001": 0.8, "wnc-retail#141": 64.85, "wnc-beta#141": 123.27, "embracing-power-starter-retail#002": 0.2, "heist-starter-retail#018": 0.3 };
  const quantities = new Map([
    ["r1", 2],
    ["r141", 1],
    ["r141en", 1],
    ["b141", 1],
    ["s2", 3],
    ["h18", 1],
    ["p1", 4],
  ]);

  it("gives each main release, then the other groups, with a value", () => {
    const rows = collectionValueByRelease(quantities, printings, releases, prices);
    expect(rows.map(({ key, group, releaseId }) => ({ key, group, releaseId }))).toEqual([
      { key: "wnc-retail", group: "main", releaseId: "wnc-retail" },
      { key: "wnc-beta", group: "main", releaseId: "wnc-beta" },
      { key: "starter", group: "starter", releaseId: null },
    ]);
    expect(rows[0]!.total).toBeCloseTo(0.8 * 2 + 64.85 * 2);
    expect(rows[2]!.total).toBeCloseTo(0.2 * 3 + 0.3);
  });

  it("lists the most expensive variants owned, once each with their languages", () => {
    const top = mostValuable(quantities, printings, prices, 3);
    expect(top.map((item) => [item.variantKey, item.price, item.printings.map((p) => p.language)])).toEqual([
      ["wnc-beta#141", 123.27, ["en"]],
      ["wnc-retail#141", 64.85, ["fr", "en"]],
      ["wnc-retail#001", 0.8, ["fr"]],
    ]);
  });
});
