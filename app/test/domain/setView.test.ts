import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../../src/domain/settings.ts";
import { computeSetView, neighbors } from "../../src/domain/setView.ts";
import { index, printingOf } from "../helpers-catalog.ts";

const params = (tirage: string | null, filtre: string | null = null, langue: string | null = null) => ({ tirage, filtre, langue });

describe("computeSetView", () => {
  it("reproduces what the set page shows for its URL parameters", () => {
    const view = computeSetView(index, "wnc", params("wnc-beta", "manquantes"), DEFAULT_SETTINGS, new Map())!;
    expect(view.selection.tab.id).toBe("wnc-beta");
    expect(view.filter).toBe("missing");
    expect(view.language).toBe("en");
    expect(view.visible).toHaveLength(172);
  });

  it("falls back to the entry language when the requested one does not exist", () => {
    expect(computeSetView(index, "wnc", params(null, null, "en"), DEFAULT_SETTINGS, new Map())!.language).toBe("en");
    expect(computeSetView(index, "wnc", params(null, null, "de"), DEFAULT_SETTINGS, new Map())!.language).toBe("fr");
  });

  it("returns null for an unknown set", () => {
    expect(computeSetView(index, "nope", params(null), DEFAULT_SETTINGS, new Map())).toBeNull();
  });
});

describe("neighbors", () => {
  const key = (n: string) => `wnc-retail#${n}`;

  it("gives the previous and next cards in the page order", () => {
    const view = computeSetView(index, "wnc", params(null), DEFAULT_SETTINGS, new Map())!;
    const { previous, next } = neighbors(view, key("003"));
    expect([previous?.collectorNumber, next?.collectorNumber]).toEqual(["002", "004"]);
    expect(neighbors(view, key("001")).previous).toBeNull();
  });

  it("browses only the filtered cards, even when the current one has left the filter", () => {
    const owned = new Map([
      [printingOf("Royce — Psycho on the Edge", "wnc-retail", "fr").id, 1],
      [printingOf("Johnny Silverhand — Rocking Renegade", "wnc-retail", "fr").id, 1],
    ]);
    const view = computeSetView(index, "wnc", params(null, "manquantes"), DEFAULT_SETTINGS, owned)!;
    // 003 is owned now (added from its card page): it is no longer listed, but its neighbors are still found.
    const { previous, next } = neighbors(view, key("003"));
    expect([previous?.collectorNumber, next?.collectorNumber]).toEqual(["002", "005a"]);
  });
});
