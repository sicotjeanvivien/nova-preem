import { describe, expect, it } from "vitest";
import { computeReleaseView, neighbors } from "../../src/domain/releaseView.ts";
import { DEFAULT_SETTINGS } from "../../src/domain/settings.ts";
import { index, printingOf } from "../helpers-catalog.ts";

const params = (filtre: string | null = null, langue: string | null = null) => ({ filtre, langue });

describe("computeReleaseView", () => {
  it("reproduces what the cards page of a release shows for its URL parameters", () => {
    const view = computeReleaseView(index, "wnc", "wnc-beta", params("manquantes"), DEFAULT_SETTINGS, new Map())!;
    expect(view.release.id).toBe("wnc-beta");
    expect(view.filter).toBe("missing");
    expect(view.languages).toEqual(["en"]);
    expect(view.language).toBe("en");
    expect(view.visible).toHaveLength(172);
  });

  it("offers VF and VO for Retail, the entry language by default", () => {
    const retail = computeReleaseView(index, "wnc", "wnc-retail", params(), DEFAULT_SETTINGS, new Map())!;
    expect(retail.languages).toEqual(["en", "fr"]);
    expect(retail.language).toBe("fr");
    expect(computeReleaseView(index, "wnc", "wnc-retail", params(null, "en"), DEFAULT_SETTINGS, new Map())!.language).toBe("en");
    expect(computeReleaseView(index, "wnc", "wnc-retail", params(null, "de"), DEFAULT_SETTINGS, new Map())!.language).toBe("fr");
  });

  it("returns null for an unknown set or release, or a release of another set", () => {
    expect(computeReleaseView(index, "nope", "wnc-retail", params(), DEFAULT_SETTINGS, new Map())).toBeNull();
    expect(computeReleaseView(index, "wnc", "nope", params(), DEFAULT_SETTINGS, new Map())).toBeNull();
  });
});

describe("neighbors", () => {
  const key = (n: string) => `wnc-retail#${n}`;

  it("gives the previous and next cards in the page order", () => {
    const view = computeReleaseView(index, "wnc", "wnc-retail", params(), DEFAULT_SETTINGS, new Map())!;
    const { previous, next } = neighbors(view, key("003"));
    expect([previous?.collectorNumber, next?.collectorNumber]).toEqual(["002", "004"]);
    expect(neighbors(view, key("001")).previous).toBeNull();
  });

  it("browses only the filtered cards, even when the current one has left the filter", () => {
    const owned = new Map([
      [printingOf("Royce — Psycho on the Edge", "wnc-retail", "fr").id, 1],
      [printingOf("Johnny Silverhand — Rocking Renegade", "wnc-retail", "fr").id, 1],
    ]);
    const view = computeReleaseView(index, "wnc", "wnc-retail", params("manquantes"), DEFAULT_SETTINGS, owned)!;
    const { previous, next } = neighbors(view, key("003"));
    expect([previous?.collectorNumber, next?.collectorNumber]).toEqual(["002", "005a"]);
  });
});
