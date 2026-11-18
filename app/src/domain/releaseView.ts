import type { CatalogSet, Release } from "./catalog.ts";
import type { CatalogIndex } from "./catalogIndex.ts";
import type { Params } from "./collectionView.ts";
import { activeValueCount, type Facet, type FacetCounts, facetCounts, type FacetSelection, filterByFacets, parseList } from "./facets.ts";
import { COST_RANGES, costRange, normalizeText } from "./search.ts";
import type { Settings } from "./settings.ts";
import { filterVariants, type GridFilter, languagesOf, type Quantities, type Variant, variantsOf } from "./variants.ts";

/** Value of the `filtre` parameter for each possession filter (absent for "all"). */
export const FILTER_PARAMS: Record<GridFilter, string | null> = {
  all: null,
  missing: "manquantes",
  owned: "possedees",
  duplicates: "doublons",
};

/**
 * Card filters of the page (docs/app-spec.md §5.1.1), on top of the possession
 * filter: name or number, and catalog identifiers of rarities, types, colors
 * and cost ranges.
 */
export interface ReleaseCardFilters {
  query: string;
  rarities: string[];
  types: string[];
  colors: string[];
  costs: string[];
}

export type CardFilterField = Exclude<keyof ReleaseCardFilters, "query">;
export const CARD_FILTER_FIELDS: readonly CardFilterField[] = ["rarities", "types", "colors", "costs"];

export const NO_CARD_FILTERS: ReleaseCardFilters = { query: "", rarities: [], types: [], colors: [], costs: [] };

/** Order of the options (spec §5.1.1). Unknown values come last, in catalog order. */
export const TYPE_ORDER = ["legend", "unit", "gear", "program"];
export const COLOR_ORDER = ["red", "yellow", "blue", "green"];

/** URL parameter of each card filter (`?rarete=rare,epic&type=unit&couleur=red&cout=3-4&nom=johnny`). */
const CARD_FILTER_PARAMS: Record<keyof ReleaseCardFilters, string> = {
  query: "nom",
  rarities: "rarete",
  types: "type",
  colors: "couleur",
  costs: "cout",
};

/** Whether the variant's name (any language) contains every word of `query`, or its number contains it; case and accents ignored. */
export function matchesNameOrNumber(variant: Variant, query: string): boolean {
  const normalized = normalizeText(query.trim());
  const words = normalized.split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  if (normalizeText(variant.collectorNumber).includes(normalized)) return true;
  return Object.values(variant.card.name).some((name) => {
    const text = normalizeText(name);
    return words.every((word) => text.includes(word));
  });
}

const QUERY_FACET = "query";

const VARIANT_FACETS: Facet<Variant>[] = [
  { id: QUERY_FACET, test: matchesNameOrNumber },
  { id: "rarities", test: (variant, value) => variant.rarity?.id === value },
  { id: "types", test: (variant, value) => variant.card.type === value },
  { id: "colors", test: (variant, value) => variant.card.color === value },
  // A card without cost (legends) is in no range.
  { id: "costs", test: (variant, value) => variant.card.cost !== null && costRange(variant.card.cost) === value },
];

function selectionOf(filters: ReleaseCardFilters): FacetSelection {
  const query = filters.query.trim();
  return { [QUERY_FACET]: query ? [query] : [], rarities: filters.rarities, types: filters.types, colors: filters.colors, costs: filters.costs };
}

/** Filters the variants of a release by name or number, rarity, type, color and cost. */
export function filterReleaseVariants(variants: readonly Variant[], filters: ReleaseCardFilters): Variant[] {
  return filterByFacets(variants, VARIANT_FACETS, selectionOf(filters));
}

/** Number of active card filters: one per value, plus the name (one removable chip each, spec §8.1). */
export function activeCardFilterCount(filters: ReleaseCardFilters): number {
  return activeValueCount(selectionOf(filters));
}

/** Options of each card filter: the values present in the release, in the order of the spec. */
export function cardFilterOptions(variants: readonly Variant[]): Record<CardFilterField, string[]> {
  const present = <T>(values: (T | null | undefined)[]) => [...new Set(values.filter((v): v is T => v !== null && v !== undefined))];
  const byOrder = (order: readonly string[]) => (a: string, b: string) => rank(order, a) - rank(order, b);
  const rarities = present(variants.map((variant) => variant.rarity));
  return {
    rarities: rarities.sort((a, b) => a.order - b.order).map((rarity) => rarity.id),
    types: present(variants.map((variant) => variant.card.type)).sort(byOrder(TYPE_ORDER)),
    colors: present(variants.map((variant) => variant.card.color)).sort(byOrder(COLOR_ORDER)),
    costs: COST_RANGES.filter((range) => variants.some((variant) => variant.card.cost !== null && costRange(variant.card.cost) === range)),
  };
}

function rank(order: readonly string[], value: string): number {
  const position = order.indexOf(value);
  return position === -1 ? order.length : position;
}

export function parseCardFilters(params: Params): ReleaseCardFilters {
  return {
    query: params[CARD_FILTER_PARAMS.query] ?? "",
    rarities: parseList(params[CARD_FILTER_PARAMS.rarities]),
    types: parseList(params[CARD_FILTER_PARAMS.types]),
    colors: parseList(params[CARD_FILTER_PARAMS.colors]),
    costs: parseList(params[CARD_FILTER_PARAMS.costs]),
  };
}

/** URL parameters of the card filters: every key, `null` for the empty ones (to remove them from the URL). */
export function cardFilterParams(filters: ReleaseCardFilters): Record<string, string | null> {
  const params: Record<string, string | null> = { [CARD_FILTER_PARAMS.query]: filters.query || null };
  for (const field of CARD_FILTER_FIELDS) params[CARD_FILTER_PARAMS[field]] = filters[field].length > 0 ? filters[field].join(",") : null;
  return params;
}

export interface ReleaseView {
  set: CatalogSet;
  release: Release;
  /** Every variant of the release, by number. */
  variants: Variant[];
  /** Languages of the release; the VF/VO selector is shown when there are several. */
  languages: string[];
  /** Entry language: the language of the quantities shown and changed. */
  language: string;
  filter: GridFilter;
  /** Card filters in effect (values absent from the release dropped). */
  cardFilters: ReleaseCardFilters;
  /** Options of each card filter, from the release. */
  cardOptions: Record<CardFilterField, string[]>;
  /** Variants each option would give, given the possession filter and the other card filters. */
  counts: FacetCounts;
  /** Variants shown, after the possession filter and the card filters. */
  visible: Variant[];
}

/**
 * What the cards page of a release shows for its URL parameters (spec §2.1,
 * §5.1.1): `filtre`, `langue`, `nom`, `rarete`, `type`, `couleur`, `cout`.
 * Used by that page and by the card page, which browses the same list
 * (previous / next, §5.9).
 */
export function computeReleaseView(
  index: CatalogIndex,
  setId: string,
  releaseId: string,
  params: Params,
  settings: Pick<Settings, "entryLanguage" | "duplicateThreshold">,
  quantities: Quantities,
): ReleaseView | null {
  const set = index.sets.get(setId);
  const release = index.releases.get(releaseId);
  if (!set || !release || release.setId !== setId || !index.printingsByRelease.has(releaseId)) return null;
  const variants = variantsOf(index, [release]);
  const languages = languagesOf(variants, index.catalog.languages);
  const langue = params.langue;
  const language =
    langue && languages.includes(langue)
      ? langue
      : languages.includes(settings.entryLanguage)
        ? settings.entryLanguage
        : (languages[0] ?? settings.entryLanguage);
  const filter = (Object.keys(FILTER_PARAMS) as GridFilter[]).find((f) => FILTER_PARAMS[f] === (params.filtre ?? null)) ?? "all";

  const cardOptions = cardFilterOptions(variants);
  const requested = parseCardFilters(params);
  const known = (field: CardFilterField) => requested[field].filter((value) => cardOptions[field].includes(value));
  const cardFilters: ReleaseCardFilters = {
    query: requested.query,
    rarities: known("rarities"),
    types: known("types"),
    colors: known("colors"),
    costs: known("costs"),
  };

  const owned = filterVariants(variants, filter, quantities, language, settings.duplicateThreshold);
  const counts = facetCounts(owned, VARIANT_FACETS, selectionOf(cardFilters), cardOptions);
  const visible = filterReleaseVariants(owned, cardFilters);
  return { set, release, variants, languages, language, filter, cardFilters, cardOptions, counts, visible };
}

/**
 * Previous and next visible variants around `variantKey`, in the order of the
 * page. If the variant has left the filters (e.g. it is no longer missing), its
 * place in the unfiltered order is used.
 */
export function neighbors(view: Pick<ReleaseView, "variants" | "visible">, variantKey: string): { previous: Variant | null; next: Variant | null } {
  const position = view.variants.findIndex((variant) => variant.key === variantKey);
  if (position === -1) return { previous: null, next: null };
  const visibleKeys = new Set(view.visible.map((variant) => variant.key));
  const before = view.variants.slice(0, position).filter((variant) => visibleKeys.has(variant.key));
  const after = view.variants.slice(position + 1).filter((variant) => visibleKeys.has(variant.key));
  return { previous: before.at(-1) ?? null, next: after[0] ?? null };
}
