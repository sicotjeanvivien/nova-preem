import { z } from "zod";

// What the user owns (docs/app-spec.md §4.1): printing identifiers and
// quantities only, never a copy of catalog data.

export const collectionEntrySchema = z.object({
  printingId: z.string().min(1),
  quantity: z.number().int().min(1),
  firstAddedAt: z.string(),
  lastAddedAt: z.string(),
});

export type CollectionEntry = z.infer<typeof collectionEntrySchema>;

/**
 * Adds `delta` copies of a printing (spec §5.1). Returns the new entry, or
 * undefined when the quantity reaches 0 (the entry is then deleted). The
 * quantity never goes below 0; `lastAddedAt` only moves when it increases.
 */
export function changeQuantity(current: CollectionEntry | undefined, printingId: string, delta: number, now: string): CollectionEntry | undefined {
  const quantity = Math.max(0, (current?.quantity ?? 0) + delta);
  if (quantity === 0) return undefined;
  if (!current) return { printingId, quantity, firstAddedAt: now, lastAddedAt: now };
  return { ...current, quantity, lastAddedAt: quantity > current.quantity ? now : current.lastAddedAt };
}
