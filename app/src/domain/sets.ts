import type { Catalog, CatalogSet } from "./catalog.ts";

export interface SetSummary {
  set: CatalogSet;
  releaseCount: number;
  cardCount: number;
  /** Languages in which at least one release of the set exists, in catalog order. */
  languages: string[];
}

/** One summary per set, in catalog order, for the set list (spec §2.1). */
export function summarizeSets(catalog: Catalog): SetSummary[] {
  const releaseSet = new Map(catalog.releases.map((release) => [release.id, release.setId]));
  return [...catalog.sets]
    .sort((a, b) => a.order - b.order)
    .map((set) => {
      const releases = catalog.releases.filter((release) => release.setId === set.id);
      const cards = new Set(catalog.printings.filter((p) => releaseSet.get(p.releaseId) === set.id).map((p) => p.cardId));
      const languages = catalog.languages.filter((language) => releases.some((release) => release.languages.includes(language)));
      return { set, releaseCount: releases.length, cardCount: cards.size, languages };
    })
    .filter((summary) => summary.cardCount > 0);
}
