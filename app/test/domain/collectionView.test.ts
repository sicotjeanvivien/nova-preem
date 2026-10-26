import { describe, expect, it } from "vitest";
import type { CollectionEntry } from "../../src/domain/collection.ts";
import {
  activeFilterCount,
  collectionParams,
  collectionRows,
  NO_FILTERS,
  parseCollectionParams,
  quantityIn,
  sortRows,
  summarizeRows,
} from "../../src/domain/collectionView.ts";
import { index, printingOf } from "../helpers-catalog.ts";

function entries(...list: [string, number, string][]): Map<string, CollectionEntry> {
  return new Map(list.map(([id, quantity, at]) => [id, { printingId: id, quantity, firstAddedAt: at, lastAddedAt: at }]));
}

const mantisFr = printingOf("Mantis Blades", "wnc-retail", "fr");
const mantisEn = printingOf("Mantis Blades", "wnc-retail", "en");
const chromeFr = printingOf("Chrome Fang", "wnc-retail", "fr");
const chromeStarter = printingOf("Chrome Fang", "embracing-power-starter-retail", "en");
const iconic = printingOf("V — Streetkid", "wnc-retail", "fr", "144");
const owned = entries(
  [mantisFr.id, 2, "2026-10-26T09:00:00Z"],
  [mantisEn.id, 1, "2026-10-26T12:00:00Z"],
  [chromeFr.id, 3, "2026-10-24T09:00:00Z"],
  [chromeStarter.id, 1, "2026-10-25T09:00:00Z"],
  [iconic.id, 1, "2026-10-20T09:00:00Z"],
  ["unknown-printing", 4, "2026-10-26T09:00:00Z"],
);

describe("collection rows (spec §5.7)", () => {
  const rows = collectionRows(index, owned, NO_FILTERS, 1);

  it("has one row per owned variant, with its quantities per language", () => {
    expect(rows).toHaveLength(4);
    const mantis = rows.find((row) => row.variant.key === mantisFr.variantKey)!;
    expect([quantityIn(mantis, "fr"), quantityIn(mantis, "en"), mantis.copies]).toEqual([2, 1, 3]);
    expect(mantis.lastAddedAt).toBe("2026-10-26T12:00:00Z");
  });

  it("counts copies and printings (each language counts), ignoring printings unknown to the catalog", () => {
    expect(summarizeRows(rows)).toEqual({ copies: 8, printings: 5 });
  });

  it("filters by language: only the quantities of that language", () => {
    const vo = collectionRows(index, owned, { ...NO_FILTERS, language: "en" }, 1);
    expect(vo.map((row) => row.variant.key).sort()).toEqual([chromeStarter.variantKey, mantisEn.variantKey].sort());
    expect(summarizeRows(vo)).toEqual({ copies: 2, printings: 2 });
  });

  it("applies the duplicate threshold per printing and counts the surplus (spec §5.5)", () => {
    const duplicates = collectionRows(index, owned, { ...NO_FILTERS, duplicates: true }, 1);
    // Mantis Blades: VF 2 (surplus 1) + VO 1 (none) → 1; Chrome Fang Retail VF 3 → 2.
    expect(duplicates.map((row) => [row.variant.card.name.en, row.surplus])).toEqual([
      ["Mantis Blades", 1],
      ["Chrome Fang", 2],
    ]);
    expect(collectionRows(index, owned, { ...NO_FILTERS, duplicates: true }, 2).map((row) => row.surplus)).toEqual([1]);
  });

  it("filters by release group, rarity, type and color", () => {
    const keys = (filters: Partial<typeof NO_FILTERS>) => collectionRows(index, owned, { ...NO_FILTERS, ...filters }, 1).length;
    expect(keys({ releases: ["starter"] })).toBe(1);
    expect(keys({ releases: ["wnc-retail"] })).toBe(3);
    expect(keys({ rarities: ["iconic"] })).toBe(1);
    expect(keys({ types: ["gear"] })).toBe(1);
    expect(keys({ colors: ["yellow"] })).toBe(0);
    expect(keys({ sets: ["wnc"] })).toBe(4);
  });
});

describe("name filter (spec §5.7)", () => {
  it("matches the French or English name, without accents, every word", () => {
    const names = (query: string) => collectionRows(index, owned, { ...NO_FILTERS, query }, 1).map((row) => row.variant.card.name.en);
    expect(names("chrome")).toEqual(["Chrome Fang", "Chrome Fang"]);
    expect(names("croc chromé")).toEqual(["Chrome Fang", "Chrome Fang"]);
    expect(names("LAMES")).toEqual(["Mantis Blades"]);
    expect(names("streetkid")).toEqual(["V — Streetkid"]);
    expect(names("nothing like this")).toEqual([]);
  });
});

describe("active filters (mobile Filtres button)", () => {
  it("counts each active filter, not the name", () => {
    expect(activeFilterCount(NO_FILTERS)).toBe(0);
    expect(activeFilterCount({ ...NO_FILTERS, query: "johnny" })).toBe(0);
    expect(activeFilterCount({ ...NO_FILTERS, language: "fr", duplicates: true, rarities: ["rare", "epic"], colors: ["red"] })).toBe(4);
  });
});

describe("sorting (spec §5.7)", () => {
  const rows = collectionRows(index, owned, NO_FILTERS, 1);
  const name = (row: (typeof rows)[number]) => row.variant.card.name.fr ?? row.variant.card.name.en!;
  const collator = new Intl.Collator("fr");
  const order = (sort: Parameters<typeof sortRows>[1]) =>
    sortRows(rows, sort, name, collator.compare).map((row) => `${row.variant.release.id} ${row.variant.collectorNumber}`);

  it("sorts by most recent entry by default", () => {
    expect(order("recent")).toEqual(["wnc-retail 025", "embracing-power-starter-retail 002", "wnc-retail 008", "wnc-retail 144"]);
  });

  it("sorts by number, name (French order), rarity (rarest first) and quantity (largest first)", () => {
    expect(order("number")).toEqual(["wnc-retail 008", "wnc-retail 025", "wnc-retail 144", "embracing-power-starter-retail 002"]);
    expect(order("name")).toEqual(["wnc-retail 008", "embracing-power-starter-retail 002", "wnc-retail 025", "wnc-retail 144"]);
    expect(order("rarity")[0]).toBe("wnc-retail 144");
    expect(order("quantity").slice(0, 2)).toEqual(["wnc-retail 008", "wnc-retail 025"]);
  });
});

describe("URL parameters", () => {
  it("round-trips the name, filters and sort, and omits the defaults", () => {
    const state = {
      filters: { ...NO_FILTERS, query: "croc", language: "fr", duplicates: true, releases: ["wnc-retail", "starter"], colors: ["red"] },
      sort: "rarity" as const,
    };
    const params = collectionParams(state.filters, state.sort);
    expect(params).toEqual({ q: "croc", langue: "fr", doublons: "1", tirage: "wnc-retail,starter", couleur: "red", tri: "rarete" });
    expect(parseCollectionParams(params)).toEqual(state);
    expect(collectionParams(NO_FILTERS, "recent")).toEqual({});
    expect(parseCollectionParams({})).toEqual({ filters: NO_FILTERS, sort: "recent" });
  });
});
