// Adapter for the public Cardmarket files (docs/prices-spec.md §1): the product
// list and the price guide of one game, regenerated every night. Everything that
// knows about Cardmarket's format is here; the rest of the price pipeline only
// sees a MarketSnapshot.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { USER_AGENT } from "../http.ts";

const BASE_URL = "https://downloads.s3.cardmarket.com/productCatalog";

export function productsUrl(game: number): string {
  return `${BASE_URL}/productList/products_singles_${game}.json`;
}

export function pricesUrl(game: number): string {
  return `${BASE_URL}/priceGuide/price_guide_${game}.json`;
}

/** "2026-11-17T02:51:32+0100" (Cardmarket) → "2026-11-17T02:51:32+01:00" (ISO 8601). */
const createdAtSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:?\d{2}$/)
  .transform((value) => value.replace(/([+-]\d{2})(\d{2})$/, "$1:$2"));

// Only the fields the pipeline uses are declared; unknown fields are dropped.
const productsFileSchema = z.object({
  version: z.literal(1),
  createdAt: createdAtSchema,
  products: z.array(
    z.object({
      idProduct: z.number().int().positive(),
      name: z.string().min(1),
      idCategory: z.number().int(),
      idExpansion: z.number().int(),
    }),
  ),
});

const price = z.number().nonnegative().nullable();

const priceGuideFileSchema = z.object({
  version: z.literal(1),
  createdAt: createdAtSchema,
  priceGuides: z.array(
    z.object({
      idProduct: z.number().int().positive(),
      idCategory: z.number().int(),
      trend: price,
      // Absent when the product has no foil data at all.
      "trend-foil": price.optional(),
    }),
  ),
});

export interface MarketProduct {
  id: number;
  name: string;
  expansionId: number;
}

/** What the pipeline needs from Cardmarket, for one product category (the single cards). */
export interface MarketSnapshot {
  /** Date of the product list, ISO 8601. */
  productsDate: string;
  /** Date of the price guide, ISO 8601: the date of the prices. */
  pricesDate: string;
  products: MarketProduct[];
  /** Price retained for each product, in euros; absent when it has none. */
  prices: Map<number, number>;
}

/**
 * Price retained for a product (spec §3): `trend` if it is above 0, otherwise
 * `trend-foil` if it is above 0, otherwise none. `low` alone (listings without
 * sales) is ignored: too unreliable.
 */
export function retainedPrice(guide: { trend: number | null; "trend-foil"?: number | null | undefined }): number | null {
  if (guide.trend !== null && guide.trend > 0) return guide.trend;
  const foil = guide["trend-foil"];
  if (foil !== undefined && foil !== null && foil > 0) return foil;
  return null;
}

/** Validates the two raw files and keeps the products of `category` (the price guide also has the sealed products). */
export function parseMarketFiles(rawProducts: unknown, rawPrices: unknown, category: number): MarketSnapshot {
  const products = parse(productsFileSchema, rawProducts, "liste des produits");
  const guide = parse(priceGuideFileSchema, rawPrices, "guide des prix");
  const prices = new Map<number, number>();
  for (const entry of guide.priceGuides) {
    if (entry.idCategory !== category) continue;
    const value = retainedPrice(entry);
    if (value !== null) prices.set(entry.idProduct, value);
  }
  return {
    productsDate: products.createdAt,
    pricesDate: guide.createdAt,
    products: products.products
      .filter((product) => product.idCategory === category)
      .map((product) => ({ id: product.idProduct, name: product.name, expansionId: product.idExpansion })),
    prices,
  };
}

function parse<T>(schema: z.ZodType<T>, raw: unknown, what: string): T {
  const result = schema.safeParse(raw);
  if (!result.success) throw new Error(`Cardmarket : format inattendu pour la ${what}\n${z.prettifyError(result.error)}`);
  return result.data;
}

export const PRODUCTS_FILE = "products.json";
export const PRICES_FILE = "price_guide.json";

/**
 * Downloads the two files of `game` into `dir` (two requests, nothing else) and
 * returns their raw content. With `offline`, reads the files downloaded last time.
 */
export async function loadMarketFiles(dir: string, game: number, offline: boolean): Promise<{ products: unknown; prices: unknown }> {
  if (!offline) {
    await mkdir(dir, { recursive: true });
    for (const [url, file] of [
      [productsUrl(game), PRODUCTS_FILE],
      [pricesUrl(game), PRICES_FILE],
    ] as const) {
      const response = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
      if (!response.ok) throw new Error(`Cardmarket : HTTP ${response.status} sur ${url}`);
      await writeFile(join(dir, file), await response.text());
    }
  }
  const read = async (file: string): Promise<unknown> => {
    try {
      return JSON.parse(await readFile(join(dir, file), "utf8"));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new Error(`${join(dir, file)} absent : lancer pnpm prices sans --offline`);
      throw error;
    }
  };
  return { products: await read(PRODUCTS_FILE), prices: await read(PRICES_FILE) };
}
