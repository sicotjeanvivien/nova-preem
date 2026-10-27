import { describe, expect, it } from "vitest";
import { costRange, normalizeText, NO_SEARCH, parseSearchParams, searchCards, searchParams } from "../../src/domain/search.ts";
import { index, printingOf } from "../helpers-catalog.ts";

const collator = new Intl.Collator("fr");
const search = (filters: Partial<typeof NO_SEARCH>, quantities = new Map<string, number>(), language = "fr") =>
  searchCards(index, quantities, { ...NO_SEARCH, ...filters }, language, collator.compare);
const names = (results: ReturnType<typeof search>, language = "fr") => results.map((r) => r.card.name[language] ?? r.card.name.en ?? "");

describe("normalizeText", () => {
  it("ignores case and accents", () => {
    expect(normalizeText("Croc Chromé")).toBe("croc chrome");
    expect(normalizeText("JÔNIN")).toBe("jonin");
    expect(normalizeText("Rock’n’Rebelle")).toBe("rock'n'rebelle");
  });
});

describe("searchCards (spec §5.6)", () => {
  it("returns every card of the catalog without query", () => {
    expect(search({})).toHaveLength(151);
  });

  it("finds a card by its name in any language, without accents", () => {
    const chrome = search({ query: "chrome" });
    expect(names(chrome)).toContain("Croc Chromé");
    expect(chrome.find((r) => r.card.name.en === "Chrome Fang")!.match).toBe("name");

    const fang = search({ query: "fang" });
    expect(names(fang)).toEqual(["Croc Chromé"]);
    expect(fang[0]!.match).toBe("otherName");
  });

  it("requires every word, in any order", () => {
    expect(names(search({ query: "rebelle johnny" }))).toEqual(["Johnny Silverhand — Rock'n'Rebelle"]);
    expect(search({ query: "johnny zzz" })).toEqual([]);
  });

  it("finds by collector number and classification", () => {
    expect(names(search({ query: "β168" }))).toEqual(["Johnny Silverhand — Rock'n'Rebelle"]);
    const rippers = search({ query: "ripperdoc" });
    expect(rippers.length).toBeGreaterThan(1);
    expect(rippers.every((r) => r.match !== null)).toBe(true);
  });

  it("searches the rules text only when asked", () => {
    expect(search({ query: "texte de rappel inexistant" })).toEqual([]);
    expect(search({ query: "epuisee" })).toEqual([]);
    expect(search({ query: "epuisee", includeRules: true }).length).toBeGreaterThan(0);
  });

  it("puts name matches first", () => {
    const results = search({ query: "arasaka" });
    const firstOther = results.findIndex((r) => r.match === "other");
    const lastName = results.map((r) => r.match).lastIndexOf("name");
    expect(firstOther === -1 || firstOther > lastName).toBe(true);
  });

  it("filters by type, color, cost range, RAM, rarity and set", () => {
    expect(search({ types: ["legend"] })).toHaveLength(27);
    expect(search({ colors: ["blue"] })).toHaveLength(38);
    expect(search({ costs: ["7+"] })).toHaveLength(12);
    expect(search({ rams: ["5", "6"] })).toHaveLength(2);
    expect(search({ rarities: ["iconic"] }).every((r) => r.printings.some((p) => p.rarityId.startsWith("iconic")))).toBe(true);
    expect(search({ sets: ["wnc"] })).toHaveLength(151);
  });

  it("filters by possession and counts the copies", () => {
    const owned = new Map([
      [printingOf("Chrome Fang", "wnc-retail", "fr").id, 3],
      [printingOf("Chrome Fang", "embracing-power-starter-retail", "en").id, 1],
    ]);
    const mine = search({ possession: ["owned"] }, owned);
    expect(names(mine)).toEqual(["Croc Chromé"]);
    expect(mine[0]!.copies).toBe(4);
    expect(search({ possession: ["missing"] }, owned)).toHaveLength(150);
    expect(search({ possession: ["owned", "missing"] }, owned)).toHaveLength(151);
  });

  it("sorts by the displayed name", () => {
    const english = names(search({ query: "johnny" }, new Map(), "en"), "en");
    expect(english).toEqual([...english].sort(new Intl.Collator("fr").compare));
  });
});

describe("cost ranges and URL parameters", () => {
  it("groups costs as in the mockups", () => {
    expect([1, 2, 3, 4, 5, 6, 7, 9].map(costRange)).toEqual(["0-2", "0-2", "3-4", "3-4", "5-6", "5-6", "7+", "7+"]);
  });

  it("round-trips the filters", () => {
    const filters = { ...NO_SEARCH, query: "johnny", includeRules: true, types: ["unit"], costs: ["7+"], possession: ["missing"] };
    const params = searchParams(filters);
    expect(params).toEqual({ q: "johnny", texte: "1", type: "unit", cout: "7+", possession: "missing" });
    expect(parseSearchParams(params)).toEqual(filters);
    expect(searchParams(NO_SEARCH)).toEqual({});
  });
});
