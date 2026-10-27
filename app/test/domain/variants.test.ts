import { describe, expect, it } from "vitest";
import { filterVariants, isVariantOwnedIn, languagesOf, ownedInOtherLanguages, variantsOf } from "../../src/domain/variants.ts";
import { index, printingOf } from "../helpers-catalog.ts";

const retail = variantsOf(index, [index.releases.get("wnc-retail")!]);
const beta = variantsOf(index, [index.releases.get("wnc-beta")!]);

describe("variants", () => {
  it("groups the languages of a printing: one Retail variant per number, in EN and FR", () => {
    expect(retail).toHaveLength(168);
    expect(retail.every((variant) => variant.printings.size === 2)).toBe(true);
    expect(retail.slice(0, 7).map((v) => v.collectorNumber)).toEqual(["001", "002", "003", "004", "005a", "005b", "006"]);
    expect(languagesOf(retail, ["en", "fr"])).toEqual(["en", "fr"]);
  });

  it("keeps Beta-only Iconics and the β prefix", () => {
    expect(beta).toHaveLength(172);
    expect(beta.at(-1)!.collectorNumber).toBe("β171");
    expect(languagesOf(beta, ["en", "fr"])).toEqual(["en"]);
  });

  it("lists one variant per release in a group tab", () => {
    const starters = variantsOf(index, ["heist-starter-retail", "heist-starter-beta"].map((id) => index.releases.get(id)!));
    expect(starters).toHaveLength(40);
    expect(starters[0]!.release.id).toBe("heist-starter-retail");
    expect(starters[20]!.release.id).toBe("heist-starter-beta");
  });
});

describe("filters (spec §5.4, §5.5)", () => {
  const johnnyFr = printingOf("Johnny Silverhand — Rocking Renegade", "wnc-retail", "fr");
  const chromeEn = printingOf("Chrome Fang", "wnc-retail", "en");
  const quantities = new Map([
    [johnnyFr.id, 3],
    [chromeEn.id, 1],
  ]);
  const johnny = retail.find((v) => v.key === johnnyFr.variantKey)!;
  const chrome = retail.find((v) => v.key === chromeEn.variantKey)!;

  it("judges ownership in the entry language", () => {
    expect(isVariantOwnedIn(johnny, quantities, "fr")).toBe(true);
    expect(isVariantOwnedIn(chrome, quantities, "fr")).toBe(false);
    expect(isVariantOwnedIn(chrome, quantities, "en")).toBe(true);
  });

  it("shows a variant missing in VF but owned in VO as missing, with the mention", () => {
    const missing = filterVariants(retail, "missing", quantities, "fr", 1);
    expect(missing).toHaveLength(167);
    expect(missing).toContain(chrome);
    expect(ownedInOtherLanguages(chrome, quantities, "fr")).toEqual(["en"]);
    expect(ownedInOtherLanguages(johnny, quantities, "fr")).toEqual([]);
  });

  it("filters owned printings and duplicates above the threshold", () => {
    expect(filterVariants(retail, "owned", quantities, "fr", 1)).toEqual([johnny]);
    expect(filterVariants(retail, "duplicates", quantities, "fr", 1)).toEqual([johnny]);
    expect(filterVariants(retail, "duplicates", quantities, "fr", 3)).toEqual([]);
    expect(filterVariants(retail, "all", quantities, "fr", 1)).toHaveLength(168);
  });
});
