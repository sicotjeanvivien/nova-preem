// Matching Cardmarket products to the catalog's variants (docs/prices-spec.md §3).
// Never guesses: a name whose counts differ on both sides is not matched, it is
// reported, and can be fixed by hand with an override.

import type { Catalog, Printing } from "../model.ts";
import type { MarketProduct, MarketSnapshot } from "./cardmarket.ts";
import type { PriceMapping } from "./mapping.ts";

/** Matching key of a name: no accents, lowercase, letters and digits only ("Adam Smasher - Ender…" = "Adam Smasher — Ender…"). */
export function nameKey(name: string): string {
  return name
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "");
}

export interface VariantPrice {
  variantKey: string;
  productId: number;
  /** Euros, or null when the product has no usable price. */
  price: number | null;
}

interface Side {
  printings: Printing[];
  products: MarketProduct[];
}

export interface PricesReport {
  summary: {
    /** Variants of the catalog. */
    variants: number;
    /** Variants matched to a Cardmarket product. */
    matched: number;
    withPrice: number;
    /** Matched, but the product has no usable price. */
    withoutPrice: number;
    unmatched: number;
    /** Groups of several variants with the same name, matched in order. */
    duplicateGroups: number;
    /** matched / variants. */
    coverage: number;
  };
  /** Releases of the catalog without a Cardmarket expansion: none of their variants have a price. */
  releasesWithoutExpansion: { releaseId: string; variants: number }[];
  /** Expansions of the mapping without any product. */
  expansionsWithoutProducts: { releaseId: string; expansionId: number }[];
  /** Names whose counts differ between the release and the expansion: not matched. */
  unmatchedNames: { releaseId: string; expansionId: number; name: string; printings: number; products: number; variantKeys: string[]; productIds: number[] }[];
  /** Products matching no variant: a name absent from the release, or an expansion absent from the mapping. */
  orphanProducts: { productId: number; name: string; expansionId: number; reason: "name-not-in-release" | "unknown-expansion" }[];
  ignoredExpansions: { expansionId: number; reason: string; products: number }[];
  /** An Iconic variant cheaper than the normal one with the same name: probably matched the wrong way round. */
  iconicCheckFailures: {
    releaseId: string;
    name: string;
    iconic: { variantKey: string; productId: number; price: number };
    normal: { variantKey: string; productId: number; price: number };
  }[];
  aliases: { from: string; to: string; products: number }[];
  overrides: { variantKey: string; productId: number; productName: string | null; price: number | null }[];
}

export interface MatchResult {
  matches: VariantPrice[];
  report: PricesReport;
}

export function matchPrices(catalog: Catalog, market: MarketSnapshot, mapping: PriceMapping): MatchResult {
  const cards = new Map(catalog.cards.map((card) => [card.id, card]));
  const rarities = new Map(catalog.rarities.map((rarity) => [rarity.id, rarity]));
  const productsById = new Map(market.products.map((product) => [product.id, product]));
  const aliases = new Map(Object.entries(mapping.nameAliases).map(([from, to]) => [nameKey(from), nameKey(to)]));
  const aliasUses = new Map<string, number>();
  const productKey = (product: MarketProduct) => {
    const key = nameKey(product.name);
    const alias = aliases.get(key);
    if (alias === undefined) return key;
    aliasUses.set(key, (aliasUses.get(key) ?? 0) + 1);
    return alias;
  };
  const englishName = (printing: Printing) => cards.get(printing.cardId)?.name.en ?? printing.variantKey;
  const variantKeys = new Set(catalog.printings.map((printing) => printing.variantKey));
  const priceOf = (productId: number) => market.prices.get(productId) ?? null;
  const round = (value: number) => Math.round(value * 100) / 100;

  const report: PricesReport = {
    summary: { variants: variantKeys.size, matched: 0, withPrice: 0, withoutPrice: 0, unmatched: 0, duplicateGroups: 0, coverage: 0 },
    releasesWithoutExpansion: [],
    expansionsWithoutProducts: [],
    unmatchedNames: [],
    orphanProducts: [],
    ignoredExpansions: [],
    iconicCheckFailures: [],
    aliases: [],
    overrides: [],
  };

  const matched = new Map<string, number>();
  /** Variants matched together under one name, for the Iconic check. */
  const groups: { releaseId: string; name: string; variants: Printing[] }[] = [];
  const unmatchedGroups: (PricesReport["unmatchedNames"][number] & { variants: Printing[] })[] = [];
  const usedProducts = new Set<number>();
  const mappedExpansions = new Set(Object.values(mapping.expansions));

  for (const release of [...catalog.releases].sort((a, b) => a.order - b.order)) {
    const english = catalog.printings
      .filter((printing) => printing.releaseId === release.id && printing.language === "en")
      .sort((a, b) => a.sortKey.localeCompare(b.sortKey));
    const expansionId = mapping.expansions[release.id];
    if (expansionId === undefined) {
      report.releasesWithoutExpansion.push({ releaseId: release.id, variants: new Set(english.map((p) => p.variantKey)).size });
      continue;
    }
    const products = market.products.filter((product) => product.expansionId === expansionId).sort((a, b) => a.id - b.id);
    if (products.length === 0) report.expansionsWithoutProducts.push({ releaseId: release.id, expansionId });

    const sides = new Map<string, Side>();
    const side = (key: string) => sides.get(key) ?? sides.set(key, { printings: [], products: [] }).get(key)!;
    for (const printing of english) side(nameKey(englishName(printing))).printings.push(printing);
    for (const product of products) side(productKey(product)).products.push(product);

    for (const { printings, products: named } of sides.values()) {
      if (printings.length === 0) {
        for (const product of named) report.orphanProducts.push({ productId: product.id, name: product.name, expansionId, reason: "name-not-in-release" });
      } else if (printings.length === named.length) {
        printings.forEach((printing, index) => {
          matched.set(printing.variantKey, named[index]!.id);
          usedProducts.add(named[index]!.id);
        });
        if (printings.length > 1) report.summary.duplicateGroups++;
        groups.push({ releaseId: release.id, name: englishName(printings[0]!), variants: printings });
      } else {
        unmatchedGroups.push({
          releaseId: release.id,
          expansionId,
          name: englishName(printings[0]!),
          printings: printings.length,
          products: named.length,
          variantKeys: printings.map((printing) => printing.variantKey),
          productIds: named.map((product) => product.id),
          variants: printings,
        });
      }
    }
  }

  for (const [variantKey, productId] of Object.entries(mapping.overrides)) {
    matched.set(variantKey, productId);
    usedProducts.add(productId);
    const product = productsById.get(productId);
    report.overrides.push({ variantKey, productId, productName: product?.name ?? null, price: product ? priceOf(productId) : null });
  }
  // A group is resolved when every one of its variants has an override.
  for (const { variants, ...group } of unmatchedGroups) {
    if (!group.variantKeys.every((key) => key in mapping.overrides)) report.unmatchedNames.push(group);
    else groups.push({ releaseId: group.releaseId, name: group.name, variants });
  }

  for (const product of market.products) {
    if (mappedExpansions.has(product.expansionId) || String(product.expansionId) in mapping.ignoredExpansions || usedProducts.has(product.id)) continue;
    report.orphanProducts.push({ productId: product.id, name: product.name, expansionId: product.expansionId, reason: "unknown-expansion" });
  }
  for (const [expansion, reason] of Object.entries(mapping.ignoredExpansions)) {
    report.ignoredExpansions.push({ expansionId: Number(expansion), reason, products: market.products.filter((p) => p.expansionId === Number(expansion)).length });
  }
  for (const [from, to] of Object.entries(mapping.nameAliases)) report.aliases.push({ from, to, products: aliasUses.get(nameKey(from)) ?? 0 });

  // Iconic check (spec §3, step 5): within a group, an Iconic cheaper than the normal version is reported, not removed.
  for (const group of groups) {
    const priced = group.variants.flatMap((printing) => {
      const productId = matched.get(printing.variantKey);
      const price = productId === undefined ? null : priceOf(productId);
      return productId === undefined || price === null ? [] : [{ variantKey: printing.variantKey, productId, price, iconic: rarities.get(printing.rarityId)?.iconic ?? false }];
    });
    for (const iconic of priced.filter((v) => v.iconic)) {
      for (const normal of priced.filter((v) => !v.iconic)) {
        if (iconic.price < normal.price) {
          report.iconicCheckFailures.push({
            releaseId: group.releaseId,
            name: group.name,
            iconic: { variantKey: iconic.variantKey, productId: iconic.productId, price: iconic.price },
            normal: { variantKey: normal.variantKey, productId: normal.productId, price: normal.price },
          });
        }
      }
    }
  }

  const matches = [...matched]
    .map(([variantKey, productId]): VariantPrice => {
      const price = priceOf(productId);
      return { variantKey, productId, price: price === null ? null : round(price) };
    })
    .sort((a, b) => a.variantKey.localeCompare(b.variantKey));
  const summary = report.summary;
  summary.matched = matches.length;
  summary.withPrice = matches.filter((match) => match.price !== null).length;
  summary.withoutPrice = summary.matched - summary.withPrice;
  summary.unmatched = summary.variants - summary.matched;
  summary.coverage = summary.variants === 0 ? 0 : Math.round((summary.matched / summary.variants) * 1000) / 1000;
  return { matches, report };
}
