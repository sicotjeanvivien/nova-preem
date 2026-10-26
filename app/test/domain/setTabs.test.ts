import { describe, expect, it } from "vitest";
import { releasesOfSet } from "../../src/domain/catalogIndex.ts";
import { buildSetTabs, releaseShortName, selectTab, tabParam } from "../../src/domain/setTabs.ts";
import { index } from "../helpers-catalog.ts";

const tabs = buildSetTabs(releasesOfSet(index, "wnc"), (release) => (index.printingsByRelease.get(release.id)?.length ?? 0) > 0);

describe("set tabs", () => {
  it("has the five fixed tabs: Retail, Beta, then one per group", () => {
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

  it("does not show a tab without printings", () => {
    const withoutDemos = buildSetTabs(releasesOfSet(index, "wnc"), (release) => release.group !== "demo");
    expect(withoutDemos.map((tab) => tab.id)).toEqual(["wnc-retail", "wnc-beta", "starter", "promo"]);
  });

  it("opens on the tab of the entry release, else the first one", () => {
    expect(selectTab(tabs, null, "wnc-retail")).toMatchObject({ tab: { id: "wnc-retail" }, release: null });
    expect(selectTab(tabs, null, "heist-starter-retail")).toMatchObject({ tab: { id: "starter" }, release: null });
    expect(selectTab(tabs, null, "unknown")).toMatchObject({ tab: { id: "wnc-retail" } });
  });

  it("reads the tab and the sub-filter from the URL parameter, and writes it back", () => {
    const promos = selectTab(tabs, "promo", "wnc-retail")!;
    expect(promos.release).toBeNull();
    expect(promos.releases).toHaveLength(9);
    expect(tabParam(promos)).toBe("promo");

    const eo = selectTab(tabs, "edgerunner-open-s1", "wnc-retail")!;
    expect(eo).toMatchObject({ tab: { id: "promo" }, release: { id: "edgerunner-open-s1" } });
    expect(eo.releases.map((r) => r.id)).toEqual(["edgerunner-open-s1"]);
    expect(tabParam(eo)).toBe("edgerunner-open-s1");

    expect(selectTab(tabs, "wnc-beta", "wnc-retail")).toMatchObject({ tab: { id: "wnc-beta" }, release: null });
    expect(selectTab(tabs, "nonsense", "wnc-retail")).toMatchObject({ tab: { id: "wnc-retail" } });
  });

  it("shortens release names inside their set", () => {
    const set = "Welcome to Night City";
    expect(releaseShortName("Welcome to Night City — Retail", set)).toBe("Retail");
    expect(releaseShortName("The Heist — Retail Starter Deck", set)).toBe("The Heist — Retail");
    expect(releaseShortName("Merc Demo Deck", set)).toBe("Merc");
    expect(releaseShortName("Edgerunner Open S1", set)).toBe("Edgerunner Open S1");
  });
});
