import { describe, expect, it } from "vitest";
import type { CollectionEntry } from "../../src/domain/collection.ts";
import {
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

describe("sorting", () => {
  const rows = collectionRows(index, owned, NO_FILTERS, 1);
  const name = (row: (typeof rows)[number]) => row.variant.card.name.fr ?? row.variant.card.name.en!;
  const collator = new Intl.Collator("fr");
  const order = (key: Parameters<typeof sortRows>[1]["key"], direction: "asc" | "desc") =>
    sortRows(rows, { key, direction }, name, collator.compare).map((row) => `${row.variant.release.id} ${row.variant.collectorNumber}`);

  it("sorts by most recent entry by default", () => {
    expect(order("recent", "desc")).toEqual(["wnc-retail 025", "embracing-power-starter-retail 002", "wnc-retail 008", "wnc-retail 144"]);
  });

  it("sorts by number, name (French order) and quantity, in both directions", () => {
    expect(order("number", "asc")).toEqual(["wnc-retail 008", "wnc-retail 025", "wnc-retail 144", "embracing-power-starter-retail 002"]);
    expect(order("name", "asc")).toEqual(["wnc-retail 008", "embracing-power-starter-retail 002", "wnc-retail 025", "wnc-retail 144"]);
    expect(order("quantity", "desc").slice(0, 2)).toEqual(["wnc-retail 008", "wnc-retail 025"]);
    expect(order("quantity-en", "desc")[0]).toBe("wnc-retail 025");
  });
});

describe("URL parameters", () => {
  it("round-trips filters and sort, and omits the defaults", () => {
    const state = {
      filters: { ...NO_FILTERS, language: "fr", duplicates: true, releases: ["wnc-retail", "starter"], colors: ["red"] },
      sort: { key: "name" as const, direction: "desc" as const },
    };
    const params = collectionParams(state.filters, state.sort);
    expect(params).toEqual({ langue: "fr", doublons: "1", tirage: "wnc-retail,starter", couleur: "red", tri: "nom", ordre: "desc" });
    expect(parseCollectionParams(params)).toEqual(state);
    expect(collectionParams(NO_FILTERS, { key: "recent", direction: "desc" })).toEqual({});
    expect(parseCollectionParams({})).toEqual({ filters: NO_FILTERS, sort: { key: "recent", direction: "desc" } });
  });
});
