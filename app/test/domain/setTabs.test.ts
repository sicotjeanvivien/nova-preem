import { describe, expect, it } from "vitest";
import { releasesOfSet } from "../../src/domain/catalogIndex.ts";
import { buildSetTabs, releaseShortName } from "../../src/domain/setTabs.ts";
import { index } from "../helpers-catalog.ts";

const tabs = buildSetTabs(releasesOfSet(index, "wnc"), (release) => (index.printingsByRelease.get(release.id)?.length ?? 0) > 0);

describe("release groups of the Collection filter", () => {
  it("has Retail, Beta, then one entry per group", () => {
    expect(tabs.map((tab) => tab.id)).toEqual(["wnc-retail", "wnc-beta", "starter", "demo", "promo"]);
    expect(tabs.find((tab) => tab.id === "promo")!.releases.map((r) => r.id)).toEqual([
      "prerelease-retail",
      "prerelease-beta",
      "box-toppers-retail",
      "box-toppers-beta",
      "edgerunner-open-s1",
      "night-city-brawl-s1",
      "night-city-showdown-s1",
      "set1-promos",
      "judge-promos",
    ]);
  });

  it("leaves out a group without printings", () => {
    const withoutDemos = buildSetTabs(releasesOfSet(index, "wnc"), (release) => release.group !== "demo");
    expect(withoutDemos.map((tab) => tab.id)).toEqual(["wnc-retail", "wnc-beta", "starter", "promo"]);
  });

  it("shortens release names inside their set", () => {
    const set = "Welcome to Night City";
    expect(releaseShortName("Welcome to Night City — Retail", set)).toBe("Retail");
    expect(releaseShortName("The Heist — Retail Starter Deck", set)).toBe("The Heist — Retail");
    expect(releaseShortName("Merc Demo Deck", set)).toBe("Merc");
    expect(releaseShortName("Edgerunner Open S1", set)).toBe("Edgerunner Open S1");
  });
});
