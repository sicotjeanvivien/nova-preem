// Source-neutral shapes produced by a source adapter and consumed by the rest
// of the pipeline. Nothing outside `sources/` should know about Netdeck.

export interface SourceSnapshot {
  source: string;
  /** When the most recent page of data was fetched (ISO 8601). */
  fetchedAt: string;
  /** Number of cards announced by the source. */
  total: number;
  cards: SourceCard[];
}

export interface SourceCard {
  id: string;
  slug: string;
  /** Full English name, e.g. "Johnny Silverhand — Rocking Renegade". */
  name: string;
  /** English name without subtitle, e.g. "Johnny Silverhand". */
  baseName: string;
  type: string;
  color: string | null;
  classifications: string[];
  keywords: string[];
  cost: number | null;
  power: number | null;
  ram: number | null;
  eddiable: boolean;
  /** Current official English rules text (errata included). */
  rulesText: string | null;
  legality: string;
  printings: SourcePrinting[];
}

export interface SourcePrinting {
  id: string;
  collectorNumber: string;
  /** Edition code as named by the source (Netdeck `set.code`). */
  editionCode: string;
  editionName: string;
  rarity: string;
  language: string;
  /** Name in the printing's language; null for English printings. */
  localizedName: string | null;
  printedRulesText: string | null;
  officialRulesText: string | null;
  artist: string | null;
  finish: string | null;
  /** Short-lived URL to download the image. */
  imageUrl: string;
  /** Identifier of the image file at the source; changes when the art changes. */
  imageVersion: string;
}
