import { createHash } from "node:crypto";
import type { Catalog } from "../src/domain/catalog.ts";
import type { CatalogSource } from "../src/domain/catalogLoader.ts";
import { realCatalogText, realManifest } from "./helpers.ts";

/**
 * A newer version of the real catalog: one new card printed in a new release,
 * and one corrected rules text. With the manifest that goes with it.
 */
export function newerCatalog() {
  const catalog = JSON.parse(realCatalogText) as Catalog;
  const card = structuredClone(catalog.cards[0]!);
  card.id = "new-card";
  card.slug = "new-card";
  card.name = { en: "Zz New Card" };
  catalog.cards.push(card);
  catalog.releases.push({ id: "set2-preview", setId: "wnc", name: { en: "Set 2 Preview", fr: "Set 2 Preview" }, group: "promo", languages: ["en"], sourceCodes: ["x"], order: 99 });
  const printing = structuredClone(catalog.printings[0]!);
  Object.assign(printing, { id: "new-printing", cardId: "new-card", releaseId: "set2-preview", variantKey: "set2-preview#001", collectorNumber: "001", sortKey: "0001", language: "en" });
  catalog.printings.push(printing);
  catalog.cards[1]!.rulesText = { ...catalog.cards[1]!.rulesText, en: "Corrected text." };
  const text = JSON.stringify(catalog);
  const manifest = {
    ...realManifest,
    version: "2026-11-02.1",
    hash: `sha256:${createHash("sha256").update(text, "utf8").digest("hex")}`,
    counts: { cards: catalog.cards.length, printings: catalog.printings.length },
  };
  return { catalog, text, manifest };
}

export function newerCatalogSource(): CatalogSource {
  const { text, manifest } = newerCatalog();
  return {
    async fetchManifest() {
      return manifest;
    },
    async fetchCatalog() {
      return text;
    },
  };
}
