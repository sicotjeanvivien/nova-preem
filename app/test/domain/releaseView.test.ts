import { describe, expect, it } from "vitest";
import {
  activeCardFilterCount,
  cardFilterParams,
  computeReleaseView,
  NO_CARD_FILTERS,
  neighbors,
  parseCardFilters,
} from "../../src/domain/releaseView.ts";
import { DEFAULT_SETTINGS } from "../../src/domain/settings.ts";
import { index, printingOf } from "../helpers-catalog.ts";

const params = (filtre: string | null = null, langue: string | null = null) => ({ ...(filtre && { filtre }), ...(langue && { langue }) });

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

describe("card filters of a release (spec §5.1.1)", () => {
  const retail = (urlParams: Record<string, string>, quantities = new Map<string, number>()) =>
    computeReleaseView(index, "wnc", "wnc-retail", urlParams, DEFAULT_SETTINGS, quantities)!;
  const numbers = (view: { visible: { collectorNumber: string }[] }) => view.visible.map((variant) => variant.collectorNumber);

  it("Retail, missing + Rare + Unit: the rare units not owned in the entry language", () => {
    const owned = new Map([[printingOf("Royce — Psycho on the Edge", "wnc-retail", "fr").id, 1]]);
    const view = retail({ filtre: "manquantes", rarete: "rare", type: "unit" });
    expect(numbers(view)).toEqual(["009", "014", "022", "042", "044", "046", "088", "089", "117", "119", "123"]);
    expect(view.visible.every((variant) => variant.rarity?.id === "rare" && variant.card.type === "unit")).toBe(true);
    // 014 is Meredith Stout; owning it in VF removes it, owning it in VO does not (the filter is per entry language).
    const meredith = (language: string) => new Map([[printingOf("Meredith Stout — Stone Cold Corpo", "wnc-retail", language).id, 1]]);
    expect(numbers(retail({ filtre: "manquantes", rarete: "rare", type: "unit" }, meredith("fr")))).not.toContain("014");
    expect(numbers(retail({ filtre: "manquantes", rarete: "rare", type: "unit" }, meredith("en")))).toContain("014");
    // A legend (Royce) owned does not change a filter on units.
    expect(numbers(retail({ filtre: "manquantes", rarete: "rare", type: "unit" }, owned))).toHaveLength(11);
  });

  it("combines several values of a criterion with OR, criteria with AND", () => {
    const rareOrEpic = retail({ rarete: "rare,epic" });
    expect(rareOrEpic.visible.every((variant) => ["rare", "epic"].includes(variant.rarity!.id))).toBe(true);
    expect(rareOrEpic.visible.length).toBe(retail({ rarete: "rare" }).visible.length + retail({ rarete: "epic" }).visible.length);
    const redUnits = retail({ type: "unit", couleur: "red" });
    expect(redUnits.visible.every((variant) => variant.card.type === "unit" && variant.card.color === "red")).toBe(true);
    expect(redUnits.visible.length).toBeGreaterThan(0);
  });

  it("offers only the values present in the release, in the order of the spec", () => {
    expect(retail({}).cardOptions).toEqual({
      rarities: ["common", "uncommon", "rare", "epic", "secret", "iconic-legend", "iconic-secret", "iconic-other"],
      types: ["legend", "unit", "gear", "program"],
      colors: ["red", "yellow", "blue", "green"],
      costs: ["0-2", "3-4", "5-6", "7+"],
    });
    const starter = computeReleaseView(index, "wnc", "embracing-power-starter-retail", {}, DEFAULT_SETTINGS, new Map())!;
    expect(starter.cardOptions.rarities).toEqual(["common", "uncommon", "rare", "epic"]);
    expect(starter.cardOptions.colors).toEqual(["red", "green"]);
  });

  it("drops values absent from the release", () => {
    const view = retail({ rarete: "nova-rare,rare,nope" });
    expect(view.cardFilters.rarities).toEqual(["rare"]);
    expect(view.visible).toEqual(retail({ rarete: "rare" }).visible);
  });

  it("finds a name in VF or VO, or a number, without case or accents", () => {
    expect(numbers(retail({ nom: "jonin" }))).toEqual(["010"]);
    expect(numbers(retail({ nom: "JAPANTOWN" }))).toEqual(["010"]);
    expect(numbers(retail({ nom: "034" }))).toEqual(["034"]);
    expect(numbers(computeReleaseView(index, "wnc", "wnc-beta", { nom: "β034" }, DEFAULT_SETTINGS, new Map())!)).toEqual(["β034"]);
    expect(numbers(retail({ nom: "silverhand johnny" }))).toEqual(["003", "011", "159", "168"]);
    expect(numbers(retail({ nom: "  " }))).toHaveLength(retail({}).variants.length);
  });

  it("puts a card without cost in no cost range", () => {
    const costed = ["0-2", "3-4", "5-6", "7+"].flatMap((range) => numbers(retail({ cout: range })));
    const legendsWithoutCost = retail({ type: "legend" }).visible.filter((variant) => variant.card.cost === null);
    expect(legendsWithoutCost.length).toBeGreaterThan(0);
    for (const legend of legendsWithoutCost) expect(costed).not.toContain(legend.collectorNumber);
    expect(retail({ cout: "3-4" }).visible.every((variant) => variant.card.cost === 3 || variant.card.cost === 4)).toBe(true);
  });

  it("counts each option given the possession filter and the other card filters", () => {
    const view = retail({ filtre: "manquantes", rarete: "rare", type: "unit" });
    // Each count is what selecting that option alone (with the other filters) would give.
    for (const rarity of view.cardOptions.rarities) {
      expect(view.counts.rarities!.get(rarity)).toBe(retail({ filtre: "manquantes", rarete: rarity, type: "unit" }).visible.length);
    }
    for (const type of view.cardOptions.types) {
      expect(view.counts.types!.get(type)).toBe(retail({ filtre: "manquantes", rarete: "rare", type }).visible.length);
    }
    expect(view.counts.rarities!.get("rare")).toBe(11);
    expect(view.counts.costs!.get("0-2")).toBe(0);
  });

  it("round-trips the filters through the URL", () => {
    const filters = { query: "johnny", rarities: ["rare", "epic"], types: ["unit"], colors: ["red"], costs: ["3-4"] };
    const urlParams = cardFilterParams(filters);
    expect(urlParams).toEqual({ nom: "johnny", rarete: "rare,epic", type: "unit", couleur: "red", cout: "3-4" });
    expect(parseCardFilters(urlParams as Record<string, string>)).toEqual(filters);
    expect(cardFilterParams(NO_CARD_FILTERS)).toEqual({ nom: null, rarete: null, type: null, couleur: null, cout: null });
    expect(activeCardFilterCount(filters)).toBe(6);
    expect(activeCardFilterCount({ ...NO_CARD_FILTERS, query: " " })).toBe(0);
  });

  it("previous / next follow every filter of the page", () => {
    const view = retail({ filtre: "manquantes", rarete: "rare", type: "unit" });
    expect(neighbors(view, "wnc-retail#014")).toMatchObject({ previous: { collectorNumber: "009" }, next: { collectorNumber: "022" } });
    // A card outside the filters (003, a legend) still finds its place in the page order.
    expect(neighbors(view, "wnc-retail#003")).toMatchObject({ previous: null, next: { collectorNumber: "009" } });
  });
});
