import type { Printing, Rarity, Release } from "./catalog.ts";
import type { CatalogIndex } from "./catalogIndex.ts";
import type { CollectionEntry } from "./collection.ts";
import type { Variant } from "./variants.ts";

// The Collection tab (docs/app-spec.md §5.5, §5.7): what is owned, filtered and sorted.

export interface CollectionFilters {
  /** Only this language (VF / VO), or every language. */
  language: string | null;
  /** Only printings above the duplicate threshold (spec §5.5). */
  duplicates: boolean;
  sets: string[];
  /** Release filter keys (see releaseFilterKey). */
  releases: string[];
  /** Rarity filter keys (see rarityFilterKey). */
  rarities: string[];
  types: string[];
  colors: string[];
}

export const NO_FILTERS: CollectionFilters = { language: null, duplicates: false, sets: [], releases: [], rarities: [], types: [], colors: [] };

export type CollectionSortKey = "recent" | "number" | "name" | "quantity" | "release" | "rarity" | `quantity-${string}`;
export type SortDirection = "asc" | "desc";
export interface CollectionSort {
  key: CollectionSortKey;
  direction: SortDirection;
}

/** Natural direction of each sort: most recent and largest quantities first, names and numbers ascending. */
export function defaultDirection(key: CollectionSortKey): SortDirection {
  return key === "recent" || key.startsWith("quantity") ? "desc" : "asc";
}

export const DEFAULT_SORT: CollectionSort = { key: "recent", direction: "desc" };

/**
 * Release filter (same groups as the set page tabs): a main release on its own
 * ("Retail", "Beta"), the other releases by group ("Starters", "Démos", "Promos").
 */
export function releaseFilterKey(release: Release): string {
  return release.group === "main" ? release.id : release.group;
}

/** Rarity filter: the three Iconic rarities together, as in the mockups. */
export function rarityFilterKey(rarity: Rarity | undefined): string {
  if (!rarity) return "unknown";
  return rarity.iconic ? "iconic" : rarity.id;
}

/**
 * One row per owned variant (a card in a release at a number), with the
 * quantity of each language in the scope of the language filter.
 */
export interface CollectionRow {
  variant: Variant;
  /** Owned printings in scope, with their quantity. */
  owned: { printing: Printing; quantity: number }[];
  copies: number;
  /** Copies above the threshold, counted per printing (spec §5.5). */
  surplus: number;
  lastAddedAt: string;
}

export function collectionRows(
  index: CatalogIndex,
  entries: ReadonlyMap<string, CollectionEntry>,
  filters: CollectionFilters,
  duplicateThreshold: number,
): CollectionRow[] {
  const byVariant = new Map<string, { printing: Printing; entry: CollectionEntry }[]>();
  for (const entry of entries.values()) {
    // Printings unknown to the current catalog are kept in the collection but not listed (spec §4.3).
    const printing = index.printings.get(entry.printingId);
    if (!printing || (filters.language && printing.language !== filters.language)) continue;
    const list = byVariant.get(printing.variantKey) ?? [];
    list.push({ printing, entry });
    byVariant.set(printing.variantKey, list);
  }

  const rows: CollectionRow[] = [];
  for (const [key, list] of byVariant) {
    const first = list[0]!.printing;
    const card = index.cards.get(first.cardId);
    const release = index.releases.get(first.releaseId);
    if (!card || !release) continue;
    const rarity = index.rarities.get(first.rarityId);
    if (filters.sets.length > 0 && !filters.sets.includes(release.setId)) continue;
    if (filters.releases.length > 0 && !filters.releases.includes(releaseFilterKey(release))) continue;
    if (filters.rarities.length > 0 && !filters.rarities.includes(rarityFilterKey(rarity))) continue;
    if (filters.types.length > 0 && !filters.types.includes(card.type)) continue;
    if (filters.colors.length > 0 && !filters.colors.includes(card.color ?? "")) continue;

    const surplus = list.reduce((sum, { entry }) => sum + Math.max(0, entry.quantity - duplicateThreshold), 0);
    if (filters.duplicates && surplus === 0) continue;

    const allPrintings = (index.printingsByRelease.get(release.id) ?? []).filter((printing) => printing.variantKey === key);
    rows.push({
      variant: {
        key,
        card,
        release,
        rarity,
        collectorNumber: first.collectorNumber,
        sortKey: first.sortKey,
        printings: new Map(allPrintings.map((printing) => [printing.language, printing])),
      },
      owned: list.map(({ printing, entry }) => ({ printing, quantity: entry.quantity })),
      copies: list.reduce((sum, { entry }) => sum + entry.quantity, 0),
      surplus,
      lastAddedAt: list.map(({ entry }) => entry.lastAddedAt).reduce((a, b) => (a > b ? a : b)),
    });
  }
  return rows;
}

/** Summary at the top of the tab: copies and printings shown (spec §5.7). */
export function summarizeRows(rows: readonly CollectionRow[]): { copies: number; printings: number } {
  return {
    copies: rows.reduce((sum, row) => sum + row.copies, 0),
    printings: rows.reduce((sum, row) => sum + row.owned.length, 0),
  };
}

export function quantityIn(row: CollectionRow, language: string): number {
  return row.owned.find(({ printing }) => printing.language === language)?.quantity ?? 0;
}

/**
 * Sorts the rows (spec §5.7). `name` gives the displayed name of a row and
 * `compareNames` compares them (French alphabetical order in the interface).
 * Ties are broken by release and number, so that the order is stable.
 */
export function sortRows(
  rows: readonly CollectionRow[],
  sort: CollectionSort,
  name: (row: CollectionRow) => string,
  compareNames: (a: string, b: string) => number,
): CollectionRow[] {
  const byNumber = (a: CollectionRow, b: CollectionRow) =>
    a.variant.release.order - b.variant.release.order || compare(a.variant.sortKey, b.variant.sortKey);
  const primary = (a: CollectionRow, b: CollectionRow): number => {
    switch (sort.key) {
      case "recent":
        return compare(a.lastAddedAt, b.lastAddedAt);
      case "number":
        return byNumber(a, b);
      case "name":
        return compareNames(name(a), name(b));
      case "quantity":
        return a.copies - b.copies;
      case "release":
        return a.variant.release.order - b.variant.release.order;
      case "rarity":
        return (a.variant.rarity?.order ?? Infinity) - (b.variant.rarity?.order ?? Infinity);
      default: {
        const language = sort.key.slice("quantity-".length);
        return quantityIn(a, language) - quantityIn(b, language);
      }
    }
  };
  const sign = sort.direction === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => sign * primary(a, b) || byNumber(a, b));
}

// URL parameters (the state survives a visit to a card page, spec §5.9).

const LIST_PARAMS = { sets: "set", releases: "tirage", rarities: "rarete", types: "type", colors: "couleur" } as const;
const SORT_PARAMS: Record<string, CollectionSortKey> = {
  recents: "recent",
  numero: "number",
  nom: "name",
  quantite: "quantity",
  tirage: "release",
  rarete: "rarity",
};

/** URL parameters as plain key → value pairs (the domain does not depend on browser APIs). */
export type Params = Readonly<Record<string, string | undefined>>;

export function parseCollectionParams(params: Params): { filters: CollectionFilters; sort: CollectionSort } {
  const list = (key: string) => params[key]?.split(",").filter(Boolean) ?? [];
  const filters: CollectionFilters = {
    language: params.langue ?? null,
    duplicates: params.doublons === "1",
    sets: list(LIST_PARAMS.sets),
    releases: list(LIST_PARAMS.releases),
    rarities: list(LIST_PARAMS.rarities),
    types: list(LIST_PARAMS.types),
    colors: list(LIST_PARAMS.colors),
  };
  const sortParam = params.tri ?? "";
  const key: CollectionSortKey = SORT_PARAMS[sortParam] ?? (sortParam.startsWith("quantite-") ? `quantity-${sortParam.slice(9)}` : "recent");
  const order = params.ordre;
  return { filters, sort: { key, direction: order === "asc" || order === "desc" ? order : defaultDirection(key) } };
}

export function collectionParams(filters: CollectionFilters, sort: CollectionSort): Record<string, string> {
  const params: Record<string, string> = {};
  if (filters.language) params.langue = filters.language;
  if (filters.duplicates) params.doublons = "1";
  for (const [field, key] of Object.entries(LIST_PARAMS) as [keyof typeof LIST_PARAMS, string][]) {
    if (filters[field].length > 0) params[key] = filters[field].join(",");
  }
  if (sort.key !== DEFAULT_SORT.key || sort.direction !== DEFAULT_SORT.direction) {
    params.tri = Object.entries(SORT_PARAMS).find(([, value]) => value === sort.key)?.[0] ?? `quantite-${sort.key.slice("quantity-".length)}`;
    if (sort.direction !== defaultDirection(sort.key)) params.ordre = sort.direction;
  }
  return params;
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
