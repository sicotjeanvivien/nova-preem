import { describe, expect, it } from "vitest";
import { diffCatalogs } from "../../src/domain/catalogDiff.ts";
import { index } from "../helpers-catalog.ts";
import { newerCatalog } from "../helpers-update.ts";

describe("diffCatalogs (update sheet, spec §6)", () => {
  it("counts new cards, new printings with their new releases, and corrected texts", () => {
    const diff = diffCatalogs(index.catalog, newerCatalog().catalog);
    expect(diff.newCards).toBe(1);
    expect(diff.newPrintings).toBe(1);
    expect(diff.newReleases.map((release) => release.id)).toEqual(["set2-preview"]);
    expect(diff.correctedTexts).toBe(1);
  });

  it("finds nothing between a catalog and itself", () => {
    expect(diffCatalogs(index.catalog, index.catalog)).toEqual({ newCards: 0, newPrintings: 0, newReleases: [], correctedTexts: 0 });
  });
});
