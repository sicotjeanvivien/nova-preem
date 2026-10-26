// Output format of catalog.json (see docs/catalog-spec.md §5).

export type LanguageCode = string;
export type Localized = Record<LanguageCode, string>;
export type ReleaseGroup = "main" | "starter" | "demo" | "promo" | "unknown";

export interface Catalog {
  schemaVersion: 1;
  generatedAt: string;
  source: { name: string; fetchedAt: string };
  languages: LanguageCode[];
  sets: CatalogSet[];
  releases: Release[];
  rarities: Rarity[];
  cards: Card[];
  printings: Printing[];
}

export interface CatalogSet {
  id: string;
  name: Localized;
  order: number;
}

export interface Release {
  id: string;
  setId: string;
  name: Localized;
  group: ReleaseGroup;
  /** Languages in which this release exists. */
  languages: LanguageCode[];
  /** Source edition codes mapped to this release. */
  sourceCodes: string[];
  order: number;
}

export interface Rarity {
  id: string;
  name: Localized;
  iconic: boolean;
  order: number;
}

export interface Card {
  id: string;
  slug: string;
  type: string;
  color: string | null;
  classifications: string[];
  keywords: string[];
  cost: number | null;
  power: number | null;
  ram: number | null;
  eddiable: boolean;
  legal: boolean;
  name: Localized;
  baseName: Localized;
  rulesText: Localized;
}

export interface Printing {
  id: string;
  cardId: string;
  releaseId: string;
  /** Same value for every language of the same printing, e.g. "wnc-retail#003". */
  variantKey: string;
  language: LanguageCode;
  /** As printed, e.g. "β003", "005a". */
  collectorNumber: string;
  sortKey: string;
  rarityId: string;
  artist: string | null;
  finish: string | null;
  image: PrintingImage | null;
  sourceCode: string;
}

/** Paths are relative to the image storage base URL (`catalog/dist/images/` in development). */
export interface PrintingImage {
  path: string;
  thumbPath: string;
  width: number;
  height: number;
}
