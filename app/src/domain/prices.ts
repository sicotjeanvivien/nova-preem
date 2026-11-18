import { z } from "zod";
import type { Printing, Release, ReleaseGroup } from "./catalog.ts";
import type { PriceStore, StoredPrices } from "./stores.ts";
import type { Quantities } from "./variants.ts";

// Indicative prices (docs/prices-spec.md §5): an order of magnitude, from the
// prices.json published every night by the pipeline. Never user data: the
// collection file does not change.

/** prices.json (spec §4): variant key → euros; a variant without a price is absent. */
export const pricesFileSchema = z.object({
  schemaVersion: z.literal(1),
  source: z.literal("cardmarket"),
  currency: z.literal("EUR"),
  /** Date of the Cardmarket prices. */
  sourceDate: z.iso.datetime({ offset: true }),
  generatedAt: z.iso.datetime({ offset: true }),
  catalogVersion: z.string(),
  prices: z.record(z.string().min(1), z.number().positive()),
});

export type PricesFile = z.infer<typeof pricesFileSchema>;
export type PriceMap = Readonly<Record<string, number>>;

/** Where prices.json comes from (our own domain, never Cardmarket). */
export interface PriceSource {
  /** Raw JSON of prices.json. */
  download(): Promise<unknown>;
}

const HOUR = 3_600_000;
/** Prices downloaded more than 12 hours ago are downloaded again at launch (online). */
export const PRICES_REFRESH_MS = 12 * HOUR;
/** Prices older than 7 days are shown as "Prix anciens". */
export const PRICES_OLD_MS = 7 * 24 * HOUR;

export function isPriceRefreshDue(stored: StoredPrices | undefined, now: Date): boolean {
  return !stored || now.getTime() - Date.parse(stored.downloadedAt) >= PRICES_REFRESH_MS;
}

/** Whether the Cardmarket prices are more than 7 days old (workflow down, device offline for long). */
export function arePricesOld(file: Pick<PricesFile, "sourceDate">, now: Date): boolean {
  return now.getTime() - Date.parse(file.sourceDate) > PRICES_OLD_MS;
}

/** Downloads prices.json, validates it and stores it. Throws without touching the stored prices on any failure. */
export async function downloadPrices(deps: { store: PriceStore; source: PriceSource }, now: Date): Promise<StoredPrices> {
  const parsed = pricesFileSchema.safeParse(await deps.source.download());
  if (!parsed.success) throw new Error("prices.json has an unexpected format", { cause: parsed.error });
  const stored: StoredPrices = { file: parsed.data, downloadedAt: now.toISOString() };
  await deps.store.save(stored);
  return stored;
}

// Rounding (spec §5, one rule for the whole app).

export type RoundedPrice = { kind: "none" } | { kind: "below" } | { kind: "approx"; value: number };

/** Below this, a card price shows as "< 0,10 €". */
export const LOWEST_PRICE = 0.1;

const toCents = (euros: number) => Math.round(euros * 100);
const roundTo = (euros: number, stepCents: number) => (Math.round(toCents(euros) / stepCents) * stepCents) / 100;

/** Price of one card: < 0,10 €; to 0,10 € up to 1 €; to 0,50 € up to 10 €; to 1 € up to 100 €; to 10 € beyond. */
export function roundPrice(price: number | undefined): RoundedPrice {
  if (price === undefined || !(price > 0)) return { kind: "none" };
  if (price < LOWEST_PRICE) return { kind: "below" };
  if (price < 1) return { kind: "approx", value: roundTo(price, 10) };
  if (price < 10) return { kind: "approx", value: roundTo(price, 50) };
  if (price < 100) return { kind: "approx", value: roundTo(price, 100) };
  return { kind: "approx", value: roundTo(price, 1000) };
}

/** A total: to 1 € under 100 €, to 10 € under 1 000 €, to 50 € beyond. */
export function roundTotal(total: number): number {
  if (total < 100) return roundTo(total, 100);
  if (total < 1000) return roundTo(total, 1000);
  return roundTo(total, 5000);
}

// Formatting: "1 250 €" in French, "€1,250" in English. Non-breaking spaces keep it on one line.

const NBSP = " ";

function formatEuros(value: number, language: string, decimals: number): string {
  const [integer = "0", fraction] = value.toFixed(decimals).split(".");
  const french = language !== "en";
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, french ? NBSP : ",");
  const amount = fraction ? `${grouped}${french ? "," : "."}${fraction}` : grouped;
  return french ? `${amount}${NBSP}€` : `€${amount}`;
}

/**
 * "—" without a price, "< 0,10 €", or "2,50 €" (two decimals under 10 €, none
 * beyond). No "≈" in front (spec §5): the rounding says it is an order of magnitude.
 */
export function formatPrice(price: number | undefined, language: string): string {
  const rounded = roundPrice(price);
  switch (rounded.kind) {
    case "none":
      return "—";
    case "below":
      return `<${NBSP}${formatEuros(LOWEST_PRICE, language, 2)}`;
    case "approx":
      return formatEuros(rounded.value, language, rounded.value < 10 ? 2 : 0);
  }
}

/** "1 250 €"; a total above 0 that rounds to 0 shows as "< 1 €". */
export function formatTotal(total: number, language: string): string {
  const rounded = roundTotal(total);
  if (rounded === 0 && total > 0) return `<${NBSP}${formatEuros(1, language, 0)}`;
  return formatEuros(rounded, language, 0);
}

// Values (sums of real prices; rounded only when shown).

export interface PricedValue {
  /** Sum of the real prices × quantities, in euros (not rounded). */
  total: number;
  /** Copies with a price. */
  priced: number;
  /** Copies without a price: they do not count in the total. */
  unpriced: number;
}

/** Value of copies of variants: price × quantity, copies without a price counted apart. */
export function valueOf(items: Iterable<{ variantKey: string; quantity: number }>, prices: PriceMap): PricedValue {
  const value: PricedValue = { total: 0, priced: 0, unpriced: 0 };
  for (const { variantKey, quantity } of items) {
    if (quantity <= 0) continue;
    const price = prices[variantKey];
    if (price === undefined) value.unpriced += quantity;
    else {
      value.total += price * quantity;
      value.priced += quantity;
    }
  }
  return value;
}

/** Value of a collection: every language of a variant shares its price (spec §1). */
export function collectionValue(quantities: Quantities, printings: ReadonlyMap<string, Printing>, prices: PriceMap): PricedValue {
  const items: { variantKey: string; quantity: number }[] = [];
  for (const [printingId, quantity] of quantities) {
    const printing = printings.get(printingId);
    if (printing) items.push({ variantKey: printing.variantKey, quantity });
  }
  return valueOf(items, prices);
}

/** Value of a complete release: one copy of each variant. */
export function releaseValue(variants: Iterable<{ key: string }>, prices: PriceMap): PricedValue {
  return valueOf(
    [...variants].map((variant) => ({ variantKey: variant.key, quantity: 1 })),
    prices,
  );
}

/** A line of "Valeur par tirage" (Stats): a main release on its own, the other releases by group. */
export interface ReleaseValueRow {
  /** The release id for a main release, else the group. */
  key: string;
  group: ReleaseGroup;
  /** Set for a main release. */
  releaseId: string | null;
  total: number;
}

const GROUP_ORDER: readonly ReleaseGroup[] = ["main", "starter", "demo", "promo", "unknown"];

/**
 * Value of the collection by release (Completion / WebStats mockups): each main
 * release (Retail, Beta), then the starters, demo decks and promos together.
 * Only the lines worth something, in release order.
 */
export function collectionValueByRelease(
  quantities: Quantities,
  printings: ReadonlyMap<string, Printing>,
  releases: ReadonlyMap<string, Release>,
  prices: PriceMap,
): ReleaseValueRow[] {
  const rows = new Map<string, ReleaseValueRow & { order: number }>();
  for (const [printingId, quantity] of quantities) {
    const printing = printings.get(printingId);
    const price = printing ? prices[printing.variantKey] : undefined;
    const release = printing ? releases.get(printing.releaseId) : undefined;
    if (!release || price === undefined || quantity <= 0) continue;
    const main = release.group === "main";
    const key = main ? release.id : release.group;
    const order = GROUP_ORDER.indexOf(release.group) * 10_000 + (main ? release.order : 0);
    const row = rows.get(key) ?? { key, group: release.group, releaseId: main ? release.id : null, total: 0, order };
    row.total += price * quantity;
    rows.set(key, row);
  }
  return [...rows.values()].sort((a, b) => a.order - b.order).map(({ order: _order, ...row }) => row);
}

export interface ValuableVariant {
  variantKey: string;
  price: number;
  /** The printings of the variant owned, e.g. its VF and its VO. */
  printings: Printing[];
}

/** The most expensive variants owned (Stats, "Les plus chères"): by price, then variant key. */
export function mostValuable(quantities: Quantities, printings: ReadonlyMap<string, Printing>, prices: PriceMap, limit = 5): ValuableVariant[] {
  const byVariant = new Map<string, ValuableVariant>();
  for (const [printingId, quantity] of quantities) {
    const printing = printings.get(printingId);
    const price = printing ? prices[printing.variantKey] : undefined;
    if (!printing || price === undefined || quantity <= 0) continue;
    const entry = byVariant.get(printing.variantKey) ?? { variantKey: printing.variantKey, price, printings: [] };
    entry.printings.push(printing);
    byVariant.set(printing.variantKey, entry);
  }
  return [...byVariant.values()]
    .sort((a, b) => b.price - a.price || a.variantKey.localeCompare(b.variantKey))
    .slice(0, limit);
}
