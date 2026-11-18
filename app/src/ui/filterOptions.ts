import { localize } from "../domain/catalog.ts";
import type { CatalogIndex } from "../domain/catalogIndex.ts";
import { rarityFilterKey } from "../domain/collectionView.ts";
import { COLOR_ORDER, TYPE_ORDER } from "../domain/releaseView.ts";
import type { Translator } from "../i18n/i18n.tsx";
import type { FilterOption } from "./FilterPanel.tsx";
import { cardColor, cardColorLabel, cardTypeLabel, rarityColor } from "./labels.ts";

// Options of the catalog-wide filters, shared by Collection and Search (docs/app-spec.md §5.6, §5.7).

/** Rarities, the three Iconics together (rarityFilterKey), from the rarest last. Shared with Search. */
export function rarityOptions(index: CatalogIndex, t: Translator["t"], language: string): FilterOption[] {
  const options = new Map<string, FilterOption>();
  for (const rarity of [...index.catalog.rarities].sort((a, b) => a.order - b.order)) {
    const value = rarityFilterKey(rarity);
    if (!options.has(value)) options.set(value, { value, label: rarity.iconic ? t("collection.iconic") : localize(rarity.name, language), dot: rarityColor(rarity) });
  }
  return [...options.values()];
}

/** Card types of the catalog, in the order of the spec (§5.1.1). Shared with Search. */
export function typeOptions(index: CatalogIndex, t: Translator["t"]): FilterOption[] {
  return ordered(index.catalog.cards.map((card) => card.type), TYPE_ORDER).map((value) => ({ value, label: cardTypeLabel(t, value) }));
}

/** Card colors of the catalog, in the order of the spec (§5.1.1). Shared with Search. */
export function colorOptions(index: CatalogIndex, t: Translator["t"]): FilterOption[] {
  return ordered(index.catalog.cards.map((card) => card.color), COLOR_ORDER).map((value) => ({ value, label: cardColorLabel(t, value), dot: cardColor(value) }));
}

function ordered(values: (string | null)[], order: readonly string[]): string[] {
  const rank = (value: string) => (order.includes(value) ? order.indexOf(value) : order.length);
  return [...new Set(values.filter((v): v is string => v !== null))].sort((a, b) => rank(a) - rank(b));
}
