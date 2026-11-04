import { describe, expect, it } from "vitest";
import { copiesOwned, defaultPrinting, exclusiveCounterpart, printingsOfVariants, splitCardName, variantsOfCard } from "../../src/domain/cardView.ts";
import { index, indexWithBetaExclusives, printingOf } from "../helpers-catalog.ts";

const cardNamed = (name: string) => index.catalog.cards.find((card) => card.name.en === name)!;
const johnny = cardNamed("Johnny Silverhand — Rocking Renegade");
const johnnyVariants = variantsOfCard(index, johnny);

describe("variants of a card", () => {
  it("lists every printing of the card, by release then number, one line per language", () => {
    expect(johnnyVariants.map((v) => `${v.release.id} ${v.collectorNumber}`)).toEqual([
      "wnc-retail 003",
      "wnc-retail 168",
      "wnc-beta β003",
      "wnc-beta β168",
      "edgerunner-open-s1 031",
    ]);
    expect(printingsOfVariants(johnnyVariants, ["en", "fr"]).map((p) => `${p.collectorNumber} ${p.language}`)).toEqual([
      "003 en",
      "003 fr",
      "168 en",
      "168 fr",
      "β003 en",
      "β168 en",
      "031 en",
    ]);
  });

  it("marks a printing exclusive to its release (Beta-only Iconic)", () => {
    const [retail, beta, iconic] = variantsOfCard(indexWithBetaExclusives, johnny);
    expect(iconic!.collectorNumber).toBe("β168");
    expect(exclusiveCounterpart(indexWithBetaExclusives, iconic!)?.id).toBe("wnc-retail");
    expect(exclusiveCounterpart(indexWithBetaExclusives, beta!)).toBeNull();
    expect(exclusiveCounterpart(indexWithBetaExclusives, retail!)).toBeNull();
  });

  it("no longer marks the Beta Iconic once the Retail has it too (catalog of 2026-11-04)", () => {
    const betaIconic = johnnyVariants.find((v) => v.collectorNumber === "β168")!;
    expect(exclusiveCounterpart(index, betaIconic)).toBeNull();
  });

  it("is not fooled by the malformed number 10 of Over the Edge (β010 in Beta)", () => {
    const variants = variantsOfCard(index, cardNamed("Over the Edge"));
    const starter = variants.find((v) => v.release.id === "embracing-power-starter-retail")!;
    expect(starter.collectorNumber).toBe("10");
    expect(exclusiveCounterpart(index, starter)).toBeNull();
  });

  it("never marks releases without a Beta/Retail counterpart", () => {
    const promos = variantsOfCard(index, cardNamed("Rebecca — Having a Moment"));
    expect(promos.every((variant) => exclusiveCounterpart(index, variant) === null)).toBe(true);
  });
});

describe("default printing (§5.9)", () => {
  it("shows the printing of the variant and language the user came from", () => {
    expect(defaultPrinting(johnnyVariants, { variantKey: "wnc-beta#168", language: "en" }, "fr")?.collectorNumber).toBe("β168");
    expect(defaultPrinting(johnnyVariants, { variantKey: "wnc-retail#003", language: "fr" }, "en")?.language).toBe("fr");
  });

  it("otherwise shows the first main printing in the display language", () => {
    const printing = defaultPrinting(johnnyVariants, { variantKey: null, language: null }, "fr");
    expect([printing?.releaseId, printing?.language]).toEqual(["wnc-retail", "fr"]);
  });

  it("falls back to any printing for a card that does not exist in that language", () => {
    const lucyna = variantsOfCard(index, cardNamed("Lucyna Kushinada — Fresh Beginnings"));
    expect(defaultPrinting(lucyna, { variantKey: null, language: null }, "fr")?.language).toBe("en");
  });
});

describe("card names and copies", () => {
  it("splits the name into title and subtitle", () => {
    expect(splitCardName("Johnny Silverhand — Rock'n'Rebelle", "Johnny Silverhand")).toEqual({ title: "Johnny Silverhand", subtitle: "Rock'n'Rebelle" });
    expect(splitCardName("Croc Chromé", "Croc Chromé")).toEqual({ title: "Croc Chromé", subtitle: null });
  });

  it("counts every copy of the card", () => {
    const quantities = new Map([
      [printingOf("Johnny Silverhand — Rocking Renegade", "wnc-retail", "fr").id, 2],
      [printingOf("Johnny Silverhand — Rocking Renegade", "wnc-beta", "en", "β168").id, 1],
    ]);
    expect(copiesOwned(printingsOfVariants(johnnyVariants, ["en", "fr"]), quantities)).toBe(3);
  });
});
