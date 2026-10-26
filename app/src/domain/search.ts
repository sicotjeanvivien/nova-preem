import type { Card, Printing } from "./catalog.ts";
import type { CatalogIndex } from "./catalogIndex.ts";
import { rarityFilterKey, type Params } from "./collectionView.ts";
import { quantityOf, type Quantities } from "./variants.ts";

// Search (docs/app-spec.md §5.6): every card of the catalog, owned or not.

export interface SearchFilters {
  query: string;
  /** Also search the rules texts. */
  includeRules: boolean;
  types: string[];
  colors: string[];
  /** Rarity filter keys (Iconics together, see rarityFilterKey). */
  rarities: string[];
  sets: string[];
  /** Cost ranges (see costRange). */
  costs: string[];
  rams: string[];
  /** "owned" and / or "missing"; none or both = every card. */
  possession: string[];
}

export const NO_SEARCH: SearchFilters = {
  query: "",
  includeRules: false,
  types: [],
  colors: [],
  rarities: [],
  sets: [],
  costs: [],
  rams: [],
  possession: [],
};

/** Case-, accent- and punctuation-insensitive form of a text (NFD, spec §5.6). */
export function normalizeText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[’']/g, "'");
}

/** Cost ranges of the mockups: "0-2", "3-4", "5-6", "7+". */
export function costRange(cost: number): string {
  if (cost <= 2) return "0-2";
  if (cost <= 4) return "3-4";
  if (cost <= 6) return "5-6";
  return "7+";
}

export const COST_RANGES = ["0-2", "3-4", "5-6", "7+"];

export interface SearchResult {
  card: Card;
  printings: Printing[];
  /** Copies owned, all printings together. */
  copies: number;
  /** Where the query was found: the displayed name, the other language's name, or elsewhere. */
  match: "name" | "otherName" | "other" | null;
}

interface IndexedCard {
  card: Card;
  printings: Printing[];
  names: Map<string, string>;
  /** Names, numbers and classifications. */
  haystack: string;
  rules: string;
}

const indexedCatalogs = new WeakMap<CatalogIndex, IndexedCard[]>();

/** Normalized search texts of every card, computed once per catalog. */
function indexedCards(index: CatalogIndex): IndexedCard[] {
  const cached = indexedCatalogs.get(index);
  if (cached) return cached;
  const cards = index.catalog.cards.map((card) => {
    const printings = index.printingsByCard.get(card.id) ?? [];
    const names = new Map(Object.entries(card.name).map(([language, name]) => [language, normalizeText(name)]));
    const numbers = [...new Set(printings.map((printing) => printing.collectorNumber))];
    const rulesTexts = [...Object.values(card.rulesText), ...printings.flatMap((printing) => (printing.printedRulesText ? [printing.printedRulesText] : []))];
    return {
      card,
      printings,
      names,
      haystack: normalizeText([...Object.values(card.name), ...numbers, ...card.classifications].join(" ¦ ")),
      rules: normalizeText(rulesTexts.join(" ¦ ")),
    };
  });
  indexedCatalogs.set(index, cards);
  return cards;
}

/**
 * Cards matching the query and the filters. Every word of the query must be
 * found (in any order). Cards whose name matches come first, then the others,
 * each group in the alphabetical order of the displayed name.
 */
export function searchCards(
  index: CatalogIndex,
  quantities: Quantities,
  filters: SearchFilters,
  displayLanguage: string,
  compareNames: (a: string, b: string) => number,
): SearchResult[] {
  const words = normalizeText(filters.query).split(/\s+/).filter(Boolean);
  const containsAll = (text: string | undefined) => text !== undefined && words.every((word) => text.includes(word));
  const wantOwned = filters.possession.includes("owned");
  const wantMissing = filters.possession.includes("missing");

  const results: SearchResult[] = [];
  for (const { card, printings, names, haystack, rules } of indexedCards(index)) {
    if (filters.types.length > 0 && !filters.types.includes(card.type)) continue;
    if (filters.colors.length > 0 && !filters.colors.includes(card.color ?? "")) continue;
    if (filters.costs.length > 0 && (card.cost === null || !filters.costs.includes(costRange(card.cost)))) continue;
    if (filters.rams.length > 0 && (card.ram === null || !filters.rams.includes(String(card.ram)))) continue;
    if (filters.rarities.length > 0 && !printings.some((p) => filters.rarities.includes(rarityFilterKey(index.rarities.get(p.rarityId))))) continue;
    if (filters.sets.length > 0 && !printings.some((p) => filters.sets.includes(index.releases.get(p.releaseId)?.setId ?? ""))) continue;

    const copies = printings.reduce((sum, printing) => sum + quantityOf(quantities, printing), 0);
    if (wantOwned !== wantMissing && (wantOwned ? copies === 0 : copies > 0)) continue;

    let match: SearchResult["match"] = null;
    if (words.length > 0) {
      const displayed = names.get(displayLanguage) ?? names.get("en");
      if (containsAll(displayed)) match = "name";
      else if ([...names.values()].some(containsAll)) match = "otherName";
      else if (containsAll(haystack) || (filters.includeRules && containsAll(`${haystack} ${rules}`))) match = "other";
      else continue;
    }
    results.push({ card, printings, copies, match });
  }

  const name = (result: SearchResult) => result.card.name[displayLanguage] ?? result.card.name.en ?? "";
  const rank = (result: SearchResult) => (result.match === "name" || result.match === "otherName" ? 0 : 1);
  return results.sort((a, b) => rank(a) - rank(b) || compareNames(name(a), name(b)));
}

// URL parameters (the state survives a visit to a card page, spec §5.9).

const LIST_PARAMS = {
  types: "type",
  colors: "couleur",
  rarities: "rarete",
  sets: "set",
  costs: "cout",
  rams: "ram",
  possession: "possession",
} as const;

export function parseSearchParams(params: Params): SearchFilters {
  const list = (key: string) => params[key]?.split(",").filter(Boolean) ?? [];
  return {
    query: params.q ?? "",
    includeRules: params.texte === "1",
    ...(Object.fromEntries(Object.entries(LIST_PARAMS).map(([field, key]) => [field, list(key)])) as Pick<
      SearchFilters,
      keyof typeof LIST_PARAMS
    >),
  };
}

export function searchParams(filters: SearchFilters): Record<string, string> {
  const params: Record<string, string> = {};
  if (filters.query) params.q = filters.query;
  if (filters.includeRules) params.texte = "1";
  for (const [field, key] of Object.entries(LIST_PARAMS) as [keyof typeof LIST_PARAMS, string][]) {
    if (filters[field].length > 0) params[key] = filters[field].join(",");
  }
  return params;
}
