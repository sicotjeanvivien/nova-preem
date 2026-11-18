// The hand-maintained correspondence between the catalog and Cardmarket
// (catalog/prices/cardmarket.json, docs/prices-spec.md §3).

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import type { Catalog } from "../model.ts";
import { CATALOG_ROOT } from "../paths.ts";

export const MAPPING_PATH = join(CATALOG_ROOT, "prices", "cardmarket.json");

const id = z.number().int().positive();

const mappingSchema = z.strictObject({
  /** Cardmarket game number in the file names (23 = Cyberpunk). */
  game: id,
  /** Product category of the single cards; the price guide also has the sealed products. */
  category: id,
  /** Catalog release id → Cardmarket expansion id. */
  expansions: z.record(z.string().min(1), id),
  /** Cardmarket expansion id → why it is ignored. */
  ignoredExpansions: z.record(z.string().regex(/^\d+$/), z.string().min(1)),
  /** Cardmarket name → catalog English name, for the source's typos. */
  nameAliases: z.record(z.string().min(1), z.string().min(1)),
  /** Variant key → Cardmarket product id: manual fix of a reported case, wins over everything. */
  overrides: z.record(z.string().min(1), id),
});

export type PriceMapping = z.infer<typeof mappingSchema>;

/** Validates the mapping, and that it only names releases and variants of the catalog. */
export function parseMapping(raw: unknown, catalog: Catalog): PriceMapping {
  const result = mappingSchema.safeParse(raw);
  if (!result.success) throw new Error(`cardmarket.json invalide\n${z.prettifyError(result.error)}`);
  const mapping = result.data;
  const releases = new Set(catalog.releases.map((release) => release.id));
  const variants = new Set(catalog.printings.map((printing) => printing.variantKey));
  const errors = [
    ...Object.keys(mapping.expansions)
      .filter((release) => !releases.has(release))
      .map((release) => `tirage inconnu du catalogue dans expansions : ${release}`),
    ...Object.keys(mapping.overrides)
      .filter((variant) => !variants.has(variant))
      .map((variant) => `variante inconnue du catalogue dans overrides : ${variant}`),
    ...Object.values(mapping.expansions)
      .filter((expansion) => String(expansion) in mapping.ignoredExpansions)
      .map((expansion) => `extension à la fois rattachée et ignorée : ${expansion}`),
  ];
  if (errors.length > 0) throw new Error(`cardmarket.json invalide\n${errors.join("\n")}`);
  return mapping;
}

export async function loadMapping(catalog: Catalog, path = MAPPING_PATH): Promise<PriceMapping> {
  return parseMapping(JSON.parse(await readFile(path, "utf8")), catalog);
}
