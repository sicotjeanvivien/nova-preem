// The published file prices.json (docs/prices-spec.md §4) and the report.

import { z } from "zod";
import type { MatchResult, PricesReport } from "./match.ts";

const isoDate = z.iso.datetime({ offset: true });

/** prices.json: variant key → euros, two decimals; a variant without a price is absent. */
export const pricesFileSchema = z.strictObject({
  schemaVersion: z.literal(1),
  source: z.literal("cardmarket"),
  currency: z.literal("EUR"),
  /** Date of Cardmarket's price guide. */
  sourceDate: isoDate,
  generatedAt: isoDate,
  catalogVersion: z.string().regex(/^\d{4}-\d{2}-\d{2}\.\d+$/),
  prices: z.record(
    z.string().regex(/^[a-z0-9-]+#.+$/),
    z
      .number()
      .positive()
      .refine((value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-6, "deux décimales au plus"),
  ),
});

export type PricesFile = z.infer<typeof pricesFileSchema>;

export interface PricesReportFile extends PricesReport {
  schemaVersion: 1;
  generatedAt: string;
  catalogVersion: string;
  productsDate: string;
  pricesDate: string;
}

/** Validates a prices.json, throwing a readable error. */
export function validatePricesFile(raw: unknown): PricesFile {
  const parsed = pricesFileSchema.safeParse(raw);
  if (!parsed.success) throw new Error(`prices.json invalide\n${z.prettifyError(parsed.error)}`);
  return parsed.data;
}

export function pricesFile(result: MatchResult, info: { sourceDate: string; generatedAt: string; catalogVersion: string }): PricesFile {
  const prices: Record<string, number> = {};
  for (const match of result.matches) if (match.price !== null) prices[match.variantKey] = match.price;
  // Checked before writing: a file that fails here is never published.
  return validatePricesFile({ schemaVersion: 1, source: "cardmarket", currency: "EUR", ...info, prices });
}
