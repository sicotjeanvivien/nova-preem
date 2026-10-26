import type { ReleaseGroup } from "./catalog.ts";
import { type CatalogIndex, releasesOfSet } from "./catalogIndex.ts";
import { isVariantOwned, quantityOf, type Quantities, variantsOf } from "./variants.ts";

// Completion measures (docs/app-spec.md §5.3).

export type Progress = {
  owned: number;
  total: number;
};

/** Integer percentage rounded down, so that 100 always means "everything" (spec §5.3). */
export function percentFloor({ owned, total }: Progress): number {
  return total === 0 ? 0 : Math.floor((owned * 100) / total);
}

function countedReleases(index: CatalogIndex, setId: string, groups: readonly ReleaseGroup[]) {
  return releasesOfSet(index, setId).filter((release) => groups.includes(release.group));
}

/** Cards of the set with a printing in a counted group, owned in any of those printings. */
export function playableSet(index: CatalogIndex, setId: string, groups: readonly ReleaseGroup[], quantities: Quantities): Progress {
  const owned = new Set<string>();
  const all = new Set<string>();
  for (const release of countedReleases(index, setId, groups)) {
    for (const printing of index.printingsByRelease.get(release.id) ?? []) {
      all.add(printing.cardId);
      if (quantityOf(quantities, printing) > 0) owned.add(printing.cardId);
    }
  }
  return { owned: owned.size, total: all.size };
}

/** Printings of the set in counted groups (each language counts), and those owned. */
export function masterSet(index: CatalogIndex, setId: string, groups: readonly ReleaseGroup[], quantities: Quantities): Progress {
  const printings = countedReleases(index, setId, groups).flatMap((release) => index.printingsByRelease.get(release.id) ?? []);
  return { owned: printings.filter((printing) => quantityOf(quantities, printing) > 0).length, total: printings.length };
}

/** Variants of the releases, owned in any language. */
export function releaseVariants(index: CatalogIndex, releaseIds: readonly string[], quantities: Quantities): Progress {
  const releases = releaseIds.map((id) => index.releases.get(id)).filter((release) => release !== undefined);
  const variants = variantsOf(index, releases);
  return { owned: variants.filter((variant) => isVariantOwned(variant, quantities)).length, total: variants.length };
}

/** Printings of a release in one language; null if the release does not exist in that language. */
export function releaseInLanguage(index: CatalogIndex, releaseId: string, language: string, quantities: Quantities): Progress | null {
  const printings = (index.printingsByRelease.get(releaseId) ?? []).filter((printing) => printing.language === language);
  if (printings.length === 0) return null;
  return { owned: printings.filter((printing) => quantityOf(quantities, printing) > 0).length, total: printings.length };
}
