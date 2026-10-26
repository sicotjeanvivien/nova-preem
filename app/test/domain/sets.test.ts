import { describe, expect, it } from "vitest";
import { catalogSchema, localize } from "../../src/domain/catalog.ts";
import { summarizeSets } from "../../src/domain/sets.ts";
import { realCatalogText } from "../helpers.ts";

const catalog = catalogSchema.parse(JSON.parse(realCatalogText));

describe("summarizeSets", () => {
  it("summarizes the real catalog: one set, its releases, cards and languages", () => {
    const [summary, ...others] = summarizeSets(catalog);
    expect(others).toEqual([]);
    expect(summary).toMatchObject({ set: { id: "wnc" }, releaseCount: 17, cardCount: 151, languages: ["en", "fr"] });
  });

  it("hides a set without any printing (announced but not in the catalog yet)", () => {
    const withEmptySet = { ...catalog, sets: [...catalog.sets, { id: "ebb", name: { en: "Next set" }, order: 2 }] };
    expect(summarizeSets(withEmptySet).map((s) => s.set.id)).toEqual(["wnc"]);
  });
});

describe("localize", () => {
  it("falls back to English when the language is missing", () => {
    expect(localize({ en: "Chrome Fang", fr: "Croc Chromé" }, "fr")).toBe("Croc Chromé");
    expect(localize({ en: "Minotaur" }, "fr")).toBe("Minotaur");
  });
});
