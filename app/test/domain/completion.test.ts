import { describe, expect, it } from "vitest";
import { masterSet, percentFloor, playableSet, releaseInLanguage, releaseVariants } from "../../src/domain/completion.ts";
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
