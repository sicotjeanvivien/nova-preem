import type { Rarity } from "./model.ts";

// Source rarity name → stable rarity code (spec §4). The order is the display order.
// French names are interface labels chosen by the project, not official translations.
const KNOWN_RARITIES: { source: string; id: string; fr: string }[] = [
  { source: "Common", id: "common", fr: "Commune" },
  { source: "Uncommon", id: "uncommon", fr: "Peu commune" },
  { source: "Rare", id: "rare", fr: "Rare" },
  { source: "Epic", id: "epic", fr: "Épique" },
  { source: "Nova Rare", id: "nova-rare", fr: "Nova Rare" },
  { source: "Secret", id: "secret", fr: "Secrète" },
  { source: "Iconic Legend", id: "iconic-legend", fr: "Iconic Légende" },
  { source: "Iconic Secret", id: "iconic-secret", fr: "Iconic Secrète" },
  { source: "Iconic Other", id: "iconic-other", fr: "Iconic Autre" },
];

export const RARITIES: Rarity[] = KNOWN_RARITIES.map(({ source, id, fr }, index) => ({
  id,
  name: { en: source, fr },
  iconic: isIconicName(source),
  order: index + 1,
}));

const raritiesBySource = new Map(KNOWN_RARITIES.map(({ source }, index) => [source, RARITIES[index]!]));

export function findRarity(sourceName: string): Rarity | undefined {
  return raritiesBySource.get(sourceName);
}

/** Rarity kept as-is for a source name missing from the table (sorted after the known ones). */
export function unknownRarity(sourceName: string): Rarity {
  return {
    id: slugify(sourceName),
    name: { en: sourceName, fr: sourceName },
    iconic: isIconicName(sourceName),
    order: RARITIES.length + 1,
  };
}

function isIconicName(sourceName: string): boolean {
  return sourceName.startsWith("Iconic ");
}

function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
