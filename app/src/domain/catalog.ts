import { z } from "zod";

// Format of catalog.json and manifest.json, produced by the catalog pipeline
// (docs/catalog-spec.md §5). Validated on download: a catalog that does not
// match is refused rather than stored.

const localized = z.record(z.string(), z.string());

export const releaseGroupSchema = z.enum(["main", "starter", "demo", "promo", "unknown"]);

const setSchema = z.object({
  id: z.string(),
  name: localized,
  order: z.number(),
});

const releaseSchema = z.object({
  id: z.string(),
  setId: z.string(),
  name: localized,
  group: releaseGroupSchema,
  languages: z.array(z.string()),
  sourceCodes: z.array(z.string()),
  order: z.number(),
  counterpartReleaseId: z.string().optional(),
});

const raritySchema = z.object({
  id: z.string(),
  name: localized,
  iconic: z.boolean(),
  order: z.number(),
});

const cardSchema = z.object({
  id: z.string(),
  slug: z.string(),
  type: z.string(),
  color: z.string().nullable(),
  classifications: z.array(z.string()),
  keywords: z.array(z.string()),
  cost: z.number().nullable(),
  power: z.number().nullable(),
  ram: z.number().nullable(),
  eddiable: z.boolean(),
  legal: z.boolean(),
  name: localized,
  baseName: localized,
  rulesText: localized,
});

const printingSchema = z.object({
  id: z.string(),
  cardId: z.string(),
  releaseId: z.string(),
  variantKey: z.string(),
  language: z.string(),
  collectorNumber: z.string(),
  sortKey: z.string(),
  rarityId: z.string(),
  artist: z.string().nullable(),
  finish: z.string().nullable(),
  image: z
    .object({ path: z.string(), thumbPath: z.string(), width: z.number(), height: z.number() })
    .nullable(),
  sourceCode: z.string(),
  printedRulesText: z.string().optional(),
});

export const catalogSchema = z.object({
  schemaVersion: z.literal(1),
  generatedAt: z.string(),
  source: z.object({ name: z.string(), fetchedAt: z.string() }),
  languages: z.array(z.string()),
  sets: z.array(setSchema),
  releases: z.array(releaseSchema),
  rarities: z.array(raritySchema),
  cards: z.array(cardSchema),
  printings: z.array(printingSchema),
});

export const manifestSchema = z.object({
  schemaVersion: z.literal(1),
  version: z.string(),
  hash: z.string(),
  generatedAt: z.string(),
  counts: z.object({ cards: z.number(), printings: z.number() }),
});

export type Catalog = z.infer<typeof catalogSchema>;
export type CatalogManifest = z.infer<typeof manifestSchema>;
export type CatalogSet = Catalog["sets"][number];
export type Release = Catalog["releases"][number];
export type ReleaseGroup = z.infer<typeof releaseGroupSchema>;
export type Rarity = Catalog["rarities"][number];
export type Card = Catalog["cards"][number];
export type Printing = Catalog["printings"][number];
export type Localized = Record<string, string>;

/** Text in the requested language, falling back to English (spec §5.8), then to any language. */
export function localize(value: Localized, language: string): string {
  return value[language] ?? value.en ?? Object.values(value)[0] ?? "";
}
