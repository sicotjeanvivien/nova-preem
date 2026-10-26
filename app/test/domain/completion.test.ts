import { describe, expect, it } from "vitest";
import {
  masterBreakdown,
  masterSet,
  percentFloor,
  playableByType,
  playableSet,
  releaseByRarity,
  releaseInLanguage,
  releaseVariants,
} from "../../src/domain/completion.ts";
import { index, printingOf } from "../helpers-catalog.ts";

const none = new Map<string, number>();

describe("completion (spec §5.3)", () => {
  it("counts the playable set over the counted groups", () => {
    expect(playableSet(index, "wnc", ["main", "starter"], none)).toEqual({ owned: 0, total: 150 });
    expect(playableSet(index, "wnc", ["main", "starter", "demo", "promo"], none).total).toBe(151);
    const owned = new Map([[printingOf("Chrome Fang", "wnc-retail", "en").id, 1]]);
    expect(playableSet(index, "wnc", ["main", "starter"], owned).owned).toBe(1);
  });

  it("counts every language of every printing in the master set", () => {
    const { total } = masterSet(index, "wnc", ["main", "starter"], none);
    // Retail EN + FR (168 × 2), Beta (172), starters (4 × 20).
    expect(total).toBe(336 + 172 + 80);
  });

  it("counts a release's variants in any language, and its printings per language", () => {
    const johnnyFr = printingOf("Johnny Silverhand — Rocking Renegade", "wnc-retail", "fr");
    const quantities = new Map([[johnnyFr.id, 2]]);
    expect(releaseVariants(index, ["wnc-retail"], quantities)).toEqual({ owned: 1, total: 168 });
    expect(releaseInLanguage(index, "wnc-retail", "fr", quantities)).toEqual({ owned: 1, total: 168 });
    expect(releaseInLanguage(index, "wnc-retail", "en", quantities)).toEqual({ owned: 0, total: 168 });
  });

  it("counts a release-exclusive printing only in its release, and offers no VF for Beta", () => {
    const iconic = printingOf("Johnny Silverhand — Rocking Renegade", "wnc-beta", "en", "β168");
    expect(releaseVariants(index, ["wnc-beta"], new Map([[iconic.id, 1]]))).toEqual({ owned: 1, total: 172 });
    expect(releaseVariants(index, ["wnc-retail"], new Map([[iconic.id, 1]])).owned).toBe(0);
    expect(releaseInLanguage(index, "wnc-beta", "fr", none)).toBeNull();
  });

  it("rounds percentages down", () => {
    expect(percentFloor({ owned: 166, total: 167 })).toBe(99);
    expect(percentFloor({ owned: 167, total: 167 })).toBe(100);
    expect(percentFloor({ owned: 0, total: 0 })).toBe(0);
  });
});


describe("rules of §5.3, one by one", () => {
  const counted = ["main", "starter"] as const;
  const johnnyBetaOnly = new Map([[printingOf("Johnny Silverhand — Rocking Renegade", "wnc-beta", "en", "β003").id, 1]]);

  it("set jouable: a card is owned through any of its printings in a counted group (here a Beta one)", () => {
    expect(playableSet(index, "wnc", counted, johnnyBetaOnly).owned).toBe(1);
    // A printing in a group that is not counted does not make the card owned.
    const promoOnly = new Map([[printingOf("Rebecca — Having a Moment", "set1-promos", "en").id, 1]]);
    expect(playableSet(index, "wnc", counted, promoOnly).owned).toBe(0);
    expect(playableSet(index, "wnc", [...counted, "promo"], promoOnly)).toEqual({ owned: 1, total: 151 });
  });

  it("master set: each printing counts separately, only in the counted groups", () => {
    const both = new Map([
      [printingOf("Chrome Fang", "wnc-retail", "fr").id, 1],
      [printingOf("Chrome Fang", "wnc-retail", "en").id, 1],
      [printingOf("Yorinobu Arasaka — Embracing Destruction", "edgerunner-open-s1", "en").id, 1],
    ]);
    expect(masterSet(index, "wnc", counted, both).owned).toBe(2);
    expect(masterSet(index, "wnc", [...counted, "promo"], both).owned).toBe(3);
  });

  it("an exclusive printing (Iconic β168) is only in the denominator of its own release", () => {
    const iconic = printingOf("Johnny Silverhand — Rocking Renegade", "wnc-beta", "en", "β168");
    const owned = new Map([[iconic.id, 1]]);
    expect(releaseVariants(index, ["wnc-beta"], owned).total).toBe(172);
    expect(releaseVariants(index, ["wnc-retail"], owned)).toEqual({ owned: 0, total: 168 });
    expect(releaseInLanguage(index, "wnc-retail", "en", owned)).toEqual({ owned: 0, total: 168 });
    // In the master set, it is one more printing to own.
    expect(masterSet(index, "wnc", counted, owned).owned).toBe(1);
  });

  it("a language absent from a release is not offered (Beta in VF, starters in VF)", () => {
    expect(releaseInLanguage(index, "wnc-beta", "fr", none)).toBeNull();
    expect(releaseInLanguage(index, "heist-starter-retail", "fr", none)).toBeNull();
    expect(releaseByRarity(index, "wnc-beta", "fr", none)).toEqual([]);
  });

  it("breaks the playable set down by card type", () => {
    const byType = playableByType(index, "wnc", counted, johnnyBetaOnly);
    // 26 and not 27: Rebecca, a Legend, only exists in promos (not counted).
    expect(byType.get("legend")).toEqual({ owned: 1, total: 26 });
    const total = [...byType.values()].reduce((sum, p) => sum + p.total, 0);
    expect(total).toBe(playableSet(index, "wnc", counted, none).total);
  });

  it("breaks the master set down by release and language, marking the groups not counted", () => {
    const rows = masterBreakdown(index, "wnc", counted, none, ["fr", "en"]);
    expect(rows.map((r) => `${r.releaseId ?? r.group} ${r.language ?? ""} ${r.progress.total} ${r.counted}`.replace("  ", " "))).toEqual([
      "wnc-retail fr 168 true",
      "wnc-retail en 168 true",
      "wnc-beta en 172 true",
      "starter 80 true",
      "demo 29 false",
      "promo 134 false",
    ]);
    const countedTotal = rows.filter((r) => r.counted).reduce((sum, r) => sum + r.progress.total, 0);
    expect(countedTotal).toBe(masterSet(index, "wnc", counted, none).total);
  });

  it("breaks a release down by rarity, all languages (variants) or one language (printings), Iconics together", () => {
    const johnnyFr = printingOf("Johnny Silverhand — Rocking Renegade", "wnc-retail", "fr");
    const owned = new Map([[johnnyFr.id, 1]]);
    const all = releaseByRarity(index, "wnc-retail", null, owned);
    expect(all.map((r) => r.key)).toEqual(["common", "uncommon", "rare", "epic", "secret", "iconic"]);
    expect(all.find((r) => r.key === "secret")!.progress).toEqual({ owned: 1, total: 4 });
    expect(all.reduce((sum, r) => sum + r.progress.total, 0)).toBe(168);
    expect(releaseByRarity(index, "wnc-retail", "en", owned).find((r) => r.key === "secret")!.progress.owned).toBe(0);
    expect(all.find((r) => r.key === "iconic")!.rarityIds.sort()).toEqual(["iconic-legend", "iconic-other"]);
  });
});
