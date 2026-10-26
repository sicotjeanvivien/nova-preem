import type { Catalog, Release } from "./catalog.ts";

/** What a new catalog brings, for the update sheet (States 3, spec §6). */
export interface CatalogDiff {
  newCards: number;
  newPrintings: number;
  /** Releases that did not exist before. */
  newReleases: Release[];
  /** Cards or printings whose texts changed (errata, corrections). */
  correctedTexts: number;
}

export function diffCatalogs(current: Catalog, next: Catalog): CatalogDiff {
  const cards = new Map(current.cards.map((card) => [card.id, card]));
  const printings = new Map(current.printings.map((printing) => [printing.id, printing]));
  const releases = new Set(current.releases.map((release) => release.id));
  const same = (a: Record<string, string>, b: Record<string, string>) => JSON.stringify(a) === JSON.stringify(b);

  let correctedTexts = 0;
  for (const card of next.cards) {
    const old = cards.get(card.id);
    if (old && (!same(old.rulesText, card.rulesText) || !same(old.name, card.name))) correctedTexts++;
  }
  for (const printing of next.printings) {
    const old = printings.get(printing.id);
    if (old && old.printedRulesText !== printing.printedRulesText) correctedTexts++;
  }
  return {
    newCards: next.cards.filter((card) => !cards.has(card.id)).length,
    newPrintings: next.printings.filter((printing) => !printings.has(printing.id)).length,
    newReleases: next.releases.filter((release) => !releases.has(release.id)).sort((a, b) => a.order - b.order),
    correctedTexts,
  };
}
