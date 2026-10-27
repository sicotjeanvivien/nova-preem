import type { Card, Printing, Release } from "./catalog.ts";
import type { CatalogIndex } from "./catalogIndex.ts";
import { quantityOf, type Quantities, type Variant, variantsOf } from "./variants.ts";

/** Every variant of a card, in release order then number (the impressions list of §5.9). */
export function variantsOfCard(index: CatalogIndex, card: Card): Variant[] {
  const releaseIds = new Set((index.printingsByCard.get(card.id) ?? []).map((printing) => printing.releaseId));
  const releases = [...releaseIds].map((id) => index.releases.get(id)).filter((release) => release !== undefined);
  return variantsOf(index, releases).filter((variant) => variant.card.id === card.id);
}

/** Printings of the variants, one per language in catalog language order. */
export function printingsOfVariants(variants: readonly Variant[], languageOrder: readonly string[]): Printing[] {
  return variants.flatMap((variant) =>
    [...variant.printings.values()].sort((a, b) => languageOrder.indexOf(a.language) - languageOrder.indexOf(b.language)),
  );
}

/**
 * The release a variant is exclusive to, if any: it belongs to a Beta/Retail
 * pair but the card has no printing at the same number in the other release
 * (e.g. the Iconic β168, Beta only). Spec §5.3 and §5.9.
 */
export function exclusiveCounterpart(index: CatalogIndex, variant: Variant): Release | null {
  const counterpartId = variant.release.counterpartReleaseId;
  if (!counterpartId) return null;
  const inCounterpart = (index.printingsByCard.get(variant.card.id) ?? []).some(
    (printing) => printing.releaseId === counterpartId && printing.sortKey === variant.sortKey,
  );
  return inCounterpart ? null : (index.releases.get(counterpartId) ?? null);
}

/**
 * Printing shown first (§5.9): the one of the variant and language the user
 * came from, else the first printing of a main release in the display
 * language, else the first printing.
 */
export function defaultPrinting(
  variants: readonly Variant[],
  origin: { variantKey: string | null; language: string | null },
  displayLanguage: string,
): Printing | null {
  const fromOrigin = variants.find((variant) => variant.key === origin.variantKey);
  if (fromOrigin) {
    return fromOrigin.printings.get(origin.language ?? displayLanguage) ?? [...fromOrigin.printings.values()][0] ?? null;
  }
  const main = variants.filter((variant) => variant.release.group === "main");
  for (const candidates of [main, variants]) {
    const printing = candidates.map((variant) => variant.printings.get(displayLanguage)).find((p) => p !== undefined);
    if (printing) return printing;
  }
  const first = variants[0];
  return first ? ([...first.printings.values()][0] ?? null) : null;
}

/** "Johnny Silverhand — Rock'n'Rebelle" → title "Johnny Silverhand", subtitle "Rock'n'Rebelle". */
export function splitCardName(name: string, baseName: string | undefined): { title: string; subtitle: string | null } {
  if (baseName && name.startsWith(`${baseName} — `)) return { title: baseName, subtitle: name.slice(baseName.length + 3) };
  return { title: name, subtitle: null };
}

/** Copies owned of a card, all printings together. */
export function copiesOwned(printings: readonly Printing[], quantities: Quantities): number {
  return printings.reduce((sum, printing) => sum + quantityOf(quantities, printing), 0);
}
