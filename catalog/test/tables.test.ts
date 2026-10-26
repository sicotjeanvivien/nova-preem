import { describe, expect, it } from "vitest";
import { EDITIONS, RELEASES, SETS } from "../src/editions.ts";
import { RARITIES, findRarity, unknownRarity } from "../src/rarities.ts";

describe("edition table", () => {
  it("maps the 18 known Netdeck codes, each once", () => {
    expect(EDITIONS).toHaveLength(18);
    expect(new Set(EDITIONS.map((edition) => edition.code)).size).toBe(18);
  });

  it("only references existing releases and sets, and uses every release", () => {
    const releaseIds = new Set(RELEASES.map((release) => release.id));
    const setIds = new Set(SETS.map((set) => set.id));
    expect(releaseIds.size).toBe(RELEASES.length);
    for (const edition of EDITIONS) expect(releaseIds).toContain(edition.releaseId);
    for (const release of RELEASES) {
      expect(setIds).toContain(release.setId);
      expect(EDITIONS.some((edition) => edition.releaseId === release.id)).toBe(true);
      if (release.retailReleaseId) expect(releaseIds).toContain(release.retailReleaseId);
    }
  });

  it("puts the French main set in the same release as the English one", () => {
    const retail = EDITIONS.filter((edition) => edition.releaseId === "wnc-retail");
    expect(retail.map(({ code, language }) => [code, language])).toEqual([
      ["welcometonightcityretail", "en"],
      ["welcometonightcityretail-fr", "fr"],
    ]);
  });
});

describe("rarity table", () => {
  it("normalizes source names to stable codes in display order", () => {
    expect(RARITIES.map((rarity) => rarity.id)).toEqual([
      "common", "uncommon", "rare", "epic", "nova-rare", "secret", "iconic-legend", "iconic-secret", "iconic-other",
    ]);
    expect(RARITIES.map((rarity) => rarity.order)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(findRarity("Nova Rare")).toMatchObject({ id: "nova-rare", iconic: false });
    expect(findRarity("Iconic Other")).toMatchObject({ id: "iconic-other", iconic: true });
  });

  it("keeps an unknown rarity as-is, after the known ones", () => {
    expect(findRarity("Ultra Secret")).toBeUndefined();
    expect(unknownRarity("Ultra Secret")).toEqual({
      id: "ultra-secret",
      name: { en: "Ultra Secret", fr: "Ultra Secret" },
      iconic: false,
      order: 10,
    });
  });
});
