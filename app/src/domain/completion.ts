import type { ReleaseGroup } from "./catalog.ts";
import { type CatalogIndex, releasesOfSet } from "./catalogIndex.ts";
import { isVariantOwned, quantityOf, type Quantities, variantsOf } from "./variants.ts";

// Completion measures (docs/app-spec.md §5.3).

export type Progress = {
  owned: number;
  total: number;
};

/** Integer percentage rounded down, so that 100 always means "everything" (spec §5.3). */
export function percentFloor({ owned, total }: Progress): number {
  return total === 0 ? 0 : Math.floor((owned * 100) / total);
}

function countedReleases(index: CatalogIndex, setId: string, groups: readonly ReleaseGroup[]) {
  return releasesOfSet(index, setId).filter((release) => groups.includes(release.group));
}

/** Cards of the set with a printing in a counted group, owned in any of those printings. */
export function playableSet(index: CatalogIndex, setId: string, groups: readonly ReleaseGroup[], quantities: Quantities): Progress {
  const owned = new Set<string>();
  const all = new Set<string>();
  for (const release of countedReleases(index, setId, groups)) {
    for (const printing of index.printingsByRelease.get(release.id) ?? []) {
      all.add(printing.cardId);
      if (quantityOf(quantities, printing) > 0) owned.add(printing.cardId);
    }
  }
  return { owned: owned.size, total: all.size };
}

/** Printings of the set in counted groups (each language counts), and those owned. */
export function masterSet(index: CatalogIndex, setId: string, groups: readonly ReleaseGroup[], quantities: Quantities): Progress {
  const printings = countedReleases(index, setId, groups).flatMap((release) => index.printingsByRelease.get(release.id) ?? []);
  return { owned: printings.filter((printing) => quantityOf(quantities, printing) > 0).length, total: printings.length };
}

/** Variants of the releases, owned in any language. */
export function releaseVariants(index: CatalogIndex, releaseIds: readonly string[], quantities: Quantities): Progress {
  const releases = releaseIds.map((id) => index.releases.get(id)).filter((release) => release !== undefined);
  const variants = variantsOf(index, releases);
  return { owned: variants.filter((variant) => isVariantOwned(variant, quantities)).length, total: variants.length };
}

/**
 * Releases of the set with at least one printing (the tiles of its page, all groups),
 * and those whose variants are all owned in any language.
 */
export function completedReleases(index: CatalogIndex, setId: string, quantities: Quantities): Progress {
  const releases = releasesOfSet(index, setId).filter((release) => index.printingsByRelease.has(release.id));
  const completed = releases.filter((release) => {
    const { owned, total } = releaseVariants(index, [release.id], quantities);
    return owned === total;
  });
  return { owned: completed.length, total: releases.length };
}

/** Printings of a release in one language; null if the release does not exist in that language. */
export function releaseInLanguage(index: CatalogIndex, releaseId: string, language: string, quantities: Quantities): Progress | null {
  const printings = (index.printingsByRelease.get(releaseId) ?? []).filter((printing) => printing.language === language);
  if (printings.length === 0) return null;
  return { owned: printings.filter((printing) => quantityOf(quantities, printing) > 0).length, total: printings.length };
}

// Breakdowns shown in Stats (spec §5.3).

/** Playable set by card type: cards with a printing in a counted group, owned in any of those printings. */
export function playableByType(index: CatalogIndex, setId: string, groups: readonly ReleaseGroup[], quantities: Quantities): Map<string, Progress> {
  const all = new Map<string, Set<string>>();
  const owned = new Map<string, Set<string>>();
  for (const release of countedReleases(index, setId, groups)) {
    for (const printing of index.printingsByRelease.get(release.id) ?? []) {
      const type = index.cards.get(printing.cardId)?.type ?? "";
      if (!all.has(type)) all.set(type, new Set());
      all.get(type)!.add(printing.cardId);
      if (quantityOf(quantities, printing) > 0) {
        if (!owned.has(type)) owned.set(type, new Set());
        owned.get(type)!.add(printing.cardId);
      }
    }
  }
  return new Map([...all].map(([type, cards]) => [type, { owned: owned.get(type)?.size ?? 0, total: cards.size }]));
}

export interface MasterBreakdownRow {
  /** A main release in one language ("Retail VF"), or a whole group ("Starters"). */
  releaseId: string | null;
  group: ReleaseGroup;
  language: string | null;
  progress: Progress;
  /** False when the group is not counted in the completion (shown greyed). */
  counted: boolean;
}

/**
 * Master set by release and language: each main release in each of its
 * languages, then one row per other group. Groups not counted are included,
 * marked as such.
 */
export function masterBreakdown(
  index: CatalogIndex,
  setId: string,
  groups: readonly ReleaseGroup[],
  quantities: Quantities,
  languageOrder: readonly string[],
): MasterBreakdownRow[] {
  const rows: MasterBreakdownRow[] = [];
  const releases = releasesOfSet(index, setId);
  const count = (printings: readonly { id: string }[]) => ({
    owned: printings.filter((printing) => (quantities.get(printing.id) ?? 0) > 0).length,
    total: printings.length,
  });
  for (const release of releases.filter((r) => r.group === "main")) {
    const printings = index.printingsByRelease.get(release.id) ?? [];
    for (const language of languageOrder.filter((code) => release.languages.includes(code))) {
      const progress = count(printings.filter((printing) => printing.language === language));
      if (progress.total > 0) rows.push({ releaseId: release.id, group: "main", language, progress, counted: groups.includes("main") });
    }
  }
  for (const group of ["starter", "demo", "promo", "unknown"] as const) {
    const printings = releases.filter((r) => r.group === group).flatMap((r) => index.printingsByRelease.get(r.id) ?? []);
    if (printings.length > 0) rows.push({ releaseId: null, group, language: null, progress: count(printings), counted: groups.includes(group) });
  }
  return rows;
}

/**
 * A release by rarity (Iconics together): variants owned in any language, or
 * printings owned in `language` (spec §5.3, "par tirage"). Rarities in display order.
 */
export function releaseByRarity(
  index: CatalogIndex,
  releaseId: string,
  language: string | null,
  quantities: Quantities,
): { key: string; rarityIds: string[]; progress: Progress }[] {
  const release = index.releases.get(releaseId);
  if (!release) return [];
  const rows = new Map<string, { rarityIds: Set<string>; order: number; owned: number; total: number }>();
  const add = (rarityId: string, owned: boolean) => {
    const rarity = index.rarities.get(rarityId);
    const key = rarity?.iconic ? "iconic" : rarityId;
    const row = rows.get(key) ?? { rarityIds: new Set(), order: rarity?.order ?? Infinity, owned: 0, total: 0 };
    row.rarityIds.add(rarityId);
    row.order = Math.min(row.order, rarity?.order ?? Infinity);
    row.total++;
    if (owned) row.owned++;
    rows.set(key, row);
  };
  if (language === null) {
    for (const variant of variantsOf(index, [release])) add(variant.rarity?.id ?? "", isVariantOwned(variant, quantities));
  } else {
    for (const printing of index.printingsByRelease.get(releaseId) ?? []) {
      if (printing.language === language) add(printing.rarityId, quantityOf(quantities, printing) > 0);
    }
  }
  return [...rows]
    .sort(([, a], [, b]) => a.order - b.order)
    .map(([key, row]) => ({ key, rarityIds: [...row.rarityIds], progress: { owned: row.owned, total: row.total } }));
}
