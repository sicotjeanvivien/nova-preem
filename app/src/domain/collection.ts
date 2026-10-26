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
