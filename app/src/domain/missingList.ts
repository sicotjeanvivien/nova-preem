/** One line of the missing list: "#015 Octant (C)". */
export interface MissingLine {
  number: string;
  name: string;
  rarity: string;
  /** Extra mention, e.g. the release when several are shown, or "en VO". */
  note?: string;
}

/**
 * Text copied by "Copier la liste" (docs/app-spec.md §5.4), ready to paste on Discord:
 * "Manques — Welcome to Night City · Retail · VF (12)" then one line per variant.
 */
export function formatMissingList(title: string, lines: readonly MissingLine[]): string {
  return [`${title} (${lines.length})`, ...lines.map(({ number, name, rarity, note }) => `#${number} ${name} (${rarity})${note ? ` · ${note}` : ""}`)].join("\n");
}
