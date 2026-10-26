import { localize } from "./catalog.ts";
import type { CatalogIndex } from "./catalogIndex.ts";
import type { CollectionEntry } from "./collection.ts";

// CSV export of the collection (docs/app-spec.md §4.4): read-only, for spreadsheets.

const HEADER = ["set", "tirage", "numero", "langue", "nom", "rarete", "quantite", "ajoute_le"];

/**
 * One line per entry, ";" separator (Excel FR), UTF-8 with BOM, CRLF line ends.
 * `language` names the sets, releases and rarities; `languageLabel` writes
 * the language of each printing ("VF", "VO"). Card names are in the
 * printing's language.
 */
export function collectionCsv(
  index: CatalogIndex,
  entries: readonly CollectionEntry[],
  language: string,
  languageLabel: (code: string) => string,
): string {
  const rows = entries.map((entry) => {
    const printing = index.printings.get(entry.printingId);
    const release = printing && index.releases.get(printing.releaseId);
    const set = release && index.sets.get(release.setId);
    const card = printing && index.cards.get(printing.cardId);
    const rarity = printing && index.rarities.get(printing.rarityId);
    const order = [set?.order ?? Infinity, release?.order ?? Infinity, printing?.sortKey ?? "", printing?.language ?? ""] as const;
    return {
      order,
      cells: [
        set ? localize(set.name, language) : "",
        release ? localize(release.name, language) : "",
        printing?.collectorNumber ?? "",
        printing ? languageLabel(printing.language) : "",
        card && printing ? localize(card.name, printing.language) : entry.printingId,
        rarity ? localize(rarity.name, language) : "",
        String(entry.quantity),
        entry.firstAddedAt.slice(0, 10),
      ],
    };
  });
  rows.sort((a, b) => {
    for (let i = 0; i < a.order.length; i++) {
      const [x, y] = [a.order[i]!, b.order[i]!];
      if (x !== y) return x < y ? -1 : 1;
    }
    return 0;
  });
  const lines = [HEADER, ...rows.map((row) => row.cells)].map((cells) => cells.map(escapeCell).join(";"));
  return `﻿${lines.join("\r\n")}\r\n`;
}

function escapeCell(value: string): string {
  return /[;"\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}
