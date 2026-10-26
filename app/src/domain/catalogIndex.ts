import type { Card, Catalog, CatalogSet, Printing, Rarity, Release } from "./catalog.ts";

/** Lookups over the catalog, built once after loading. */
export interface CatalogIndex {
  catalog: Catalog;
  sets: Map<string, CatalogSet>;
  releases: Map<string, Release>;
  rarities: Map<string, Rarity>;
  cards: Map<string, Card>;
  cardsBySlug: Map<string, Card>;
  printings: Map<string, Printing>;
  /** Printings of each release, in catalog order (number, then language). */
  printingsByRelease: Map<string, Printing[]>;
  printingsByCard: Map<string, Printing[]>;
}

export function indexCatalog(catalog: Catalog): CatalogIndex {
  const byId = <T extends { id: string }>(items: T[]) => new Map(items.map((item) => [item.id, item]));
  return {
    catalog,
    sets: byId(catalog.sets),
    releases: byId(catalog.releases),
    rarities: byId(catalog.rarities),
    cards: byId(catalog.cards),
    cardsBySlug: new Map(catalog.cards.map((card) => [card.slug, card])),
    printings: byId(catalog.printings),
    printingsByRelease: groupBy(catalog.printings, (printing) => printing.releaseId),
    printingsByCard: groupBy(catalog.printings, (printing) => printing.cardId),
  };
}

/** Releases of a set, in display order. */
export function releasesOfSet(index: CatalogIndex, setId: string): Release[] {
  return index.catalog.releases.filter((release) => release.setId === setId).sort((a, b) => a.order - b.order);
}

export function groupBy<T>(items: readonly T[], key: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    const group = groups.get(k);
    if (group) group.push(item);
    else groups.set(k, [item]);
  }
  return groups;
}
