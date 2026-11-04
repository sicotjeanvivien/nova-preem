import { catalogSchema } from "../src/domain/catalog.ts";
import { indexCatalog } from "../src/domain/catalogIndex.ts";
import { realCatalogText } from "./helpers.ts";

/** Index of the real catalog (catalog/dist/catalog.json). */
export const index = indexCatalog(catalogSchema.parse(JSON.parse(realCatalogText)));

/** Printing of a card in a release and language, by English name. */
export function printingOf(englishName: string, releaseId: string, language: string, collectorNumber?: string) {
  const card = index.catalog.cards.find((c) => c.name.en === englishName);
  if (!card) throw new Error(`no card ${englishName}`);
  const printing = (index.printingsByCard.get(card.id) ?? []).find(
    (p) => p.releaseId === releaseId && p.language === language && (!collectorNumber || p.collectorNumber === collectorNumber),
  );
  if (!printing) throw new Error(`no printing ${englishName} ${releaseId} ${language}`);
  return printing;
}

/**
 * The real catalog without the Retail Iconic Secrets 168–171, as it was until 2026-11-04:
 * their Beta printings β168–β171 are then exclusive to the Beta (§5.3), a case the real data no longer has.
 */
export const indexWithBetaExclusives = indexCatalog({
  ...index.catalog,
  printings: index.catalog.printings.filter((p) => !(p.releaseId === "wnc-retail" && ["168", "169", "170", "171"].includes(p.collectorNumber))),
});
