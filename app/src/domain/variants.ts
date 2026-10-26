import type { Card, Printing, Rarity, Release } from "./catalog.ts";
import { type CatalogIndex, groupBy } from "./catalogIndex.ts";

/** Printing identifier → quantity owned (only owned printings are present). */
export type Quantities = ReadonlyMap<string, number>;

/**
 * A variant: the printings of a card in one release at one number, all
 * languages together (docs/app-spec.md §3). The unit of the set grid.
 */
export interface Variant {
  key: string;
  card: Card;
  release: Release;
  rarity: Rarity | undefined;
  /** As printed, e.g. "β003". */
  collectorNumber: string;
  sortKey: string;
  printings: Map<string, Printing>;
}

/** Variants of the given releases, by release order then number. */
export function variantsOf(index: CatalogIndex, releases: readonly Release[]): Variant[] {
  const variants: Variant[] = [];
  for (const release of [...releases].sort((a, b) => a.order - b.order)) {
    const printings = index.printingsByRelease.get(release.id) ?? [];
    for (const [key, group] of groupBy(printings, (printing) => printing.variantKey)) {
      const first = group[0]!;
      const card = index.cards.get(first.cardId);
      if (!card) continue;
      variants.push({
        key,
        card,
        release,
        rarity: index.rarities.get(first.rarityId),
        collectorNumber: first.collectorNumber,
        sortKey: first.sortKey,
        printings: new Map(group.map((printing) => [printing.language, printing])),
      });
    }
  }
  return variants.sort((a, b) => a.release.order - b.release.order || compare(a.sortKey, b.sortKey));
}

export function quantityOf(quantities: Quantities, printing: Printing | undefined): number {
  return printing ? (quantities.get(printing.id) ?? 0) : 0;
}

/** Owned in any language (spec §5.2). */
export function isVariantOwned(variant: Variant, quantities: Quantities): boolean {
  return [...variant.printings.values()].some((printing) => quantityOf(quantities, printing) > 0);
}

/**
 * Owned in `language` (spec §5.2). A variant that does not exist in that
 * language is judged on all its languages.
 */
export function isVariantOwnedIn(variant: Variant, quantities: Quantities, language: string): boolean {
  const printing = variant.printings.get(language);
  return printing ? quantityOf(quantities, printing) > 0 : isVariantOwned(variant, quantities);
}

export type GridFilter = "all" | "missing" | "owned" | "duplicates";

/**
 * Filters of the set page (spec §5.4, §5.5), for the entry language:
 * missing / owned in that language, or a printing in that language above the
 * duplicate threshold.
 */
export function filterVariants(
  variants: readonly Variant[],
  filter: GridFilter,
  quantities: Quantities,
  language: string,
  duplicateThreshold: number,
): Variant[] {
  switch (filter) {
    case "all":
      return [...variants];
    case "missing":
      return variants.filter((variant) => !isVariantOwnedIn(variant, quantities, language));
    case "owned":
      return variants.filter((variant) => isVariantOwnedIn(variant, quantities, language));
    case "duplicates":
      return variants.filter((variant) => {
        const printing = variant.printings.get(language);
        const candidates = printing ? [printing] : [...variant.printings.values()];
        return candidates.some((p) => quantityOf(quantities, p) > duplicateThreshold);
      });
  }
}

/** For a variant missing in `language`: the other languages in which it is owned ("en VO", spec §5.4). */
export function ownedInOtherLanguages(variant: Variant, quantities: Quantities, language: string): string[] {
  if (!variant.printings.has(language) || isVariantOwnedIn(variant, quantities, language)) return [];
  return [...variant.printings].filter(([lang, printing]) => lang !== language && quantityOf(quantities, printing) > 0).map(([lang]) => lang);
}

/** Languages in which at least one of the variants exists, in the given order. */
export function languagesOf(variants: readonly Variant[], order: readonly string[]): string[] {
  const present = new Set(variants.flatMap((variant) => [...variant.printings.keys()]));
  return order.filter((language) => present.has(language));
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
