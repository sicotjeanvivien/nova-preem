// Multiple-choice filters ("facets") shared by the filter panels (docs/app-spec.md §5.1.1, §8.1):
// several values of one criterion are combined with OR, different criteria with AND.

/** One criterion: `test` tells whether an item has one value of it. */
export interface Facet<Item> {
  id: string;
  test: (item: Item, value: string) => boolean;
}

/** Selected values per criterion id; a criterion without values does not filter. */
export type FacetSelection = Readonly<Record<string, readonly string[] | undefined>>;

/** Whether `item` matches every criterion of `selection` (except `skip`). */
export function matchesFacets<Item>(item: Item, facets: readonly Facet<Item>[], selection: FacetSelection, skip?: string): boolean {
  return facets.every((facet) => {
    if (facet.id === skip) return true;
    const values = selection[facet.id];
    return !values || values.length === 0 || values.some((value) => facet.test(item, value));
  });
}

/** Items matching every criterion of `selection`. */
export function filterByFacets<Item>(items: readonly Item[], facets: readonly Facet<Item>[], selection: FacetSelection): Item[] {
  return items.filter((item) => matchesFacets(item, facets, selection));
}

/** Number of items each option would give, given the other criteria: criterion id → value → count. */
export type FacetCounts = Readonly<Record<string, ReadonlyMap<string, number>>>;

/**
 * For each option of each criterion, the number of items it would give,
 * taking into account the other criteria (but not the other values of its
 * own, which it would be OR-ed with).
 */
export function facetCounts<Item>(
  items: readonly Item[],
  facets: readonly Facet<Item>[],
  selection: FacetSelection,
  options: Readonly<Record<string, readonly string[]>>,
): FacetCounts {
  const counts: Record<string, Map<string, number>> = {};
  for (const facet of facets) {
    const values = options[facet.id];
    if (!values) continue;
    const others = items.filter((item) => matchesFacets(item, facets, selection, facet.id));
    counts[facet.id] = new Map(values.map((value) => [value, others.filter((item) => facet.test(item, value)).length]));
  }
  return counts;
}

/** Number of active values (one removable chip each, spec §8.1). */
export function activeValueCount(selection: FacetSelection): number {
  return Object.values(selection).reduce((sum, values) => sum + (values?.length ?? 0), 0);
}

/** Parses a comma-separated URL value ("rare,epic"). */
export function parseList(value: string | undefined): string[] {
  return value?.split(",").filter(Boolean) ?? [];
}
