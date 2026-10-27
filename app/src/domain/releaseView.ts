import type { CatalogSet, Release } from "./catalog.ts";
import type { CatalogIndex } from "./catalogIndex.ts";
import type { Settings } from "./settings.ts";
import { filterVariants, type GridFilter, languagesOf, type Quantities, type Variant, variantsOf } from "./variants.ts";

/** URL parameters of the cards of a release (docs/app-spec.md §2.1): `/sets/wnc/wnc-retail?filtre=manquantes&langue=fr`. */
export interface ReleaseViewParams {
  filtre: string | null;
  langue: string | null;
}

/** Value of the `filtre` parameter for each filter (absent for "all"). */
export const FILTER_PARAMS: Record<GridFilter, string | null> = {
  all: null,
  missing: "manquantes",
  owned: "possedees",
  duplicates: "doublons",
};

export interface ReleaseView {
  set: CatalogSet;
  release: Release;
  /** Every variant of the release, by number. */
  variants: Variant[];
  /** Languages of the release; the VF/VO selector is shown when there are several. */
  languages: string[];
  /** Language of the quantities shown and changed. */
  language: string;
  filter: GridFilter;
  /** Variants shown, after the filter. */
  visible: Variant[];
}

/**
 * What the cards page of a release shows for its URL parameters. Used by that
 * page and by the card page, which browses the same list (previous / next, §5.9).
 */
export function computeReleaseView(
  index: CatalogIndex,
  setId: string,
  releaseId: string,
  params: ReleaseViewParams,
  settings: Pick<Settings, "entryLanguage" | "duplicateThreshold">,
  quantities: Quantities,
): ReleaseView | null {
  const set = index.sets.get(setId);
  const release = index.releases.get(releaseId);
  if (!set || !release || release.setId !== setId || !index.printingsByRelease.has(releaseId)) return null;
  const variants = variantsOf(index, [release]);
  const languages = languagesOf(variants, index.catalog.languages);
  const language =
    params.langue && languages.includes(params.langue)
      ? params.langue
      : languages.includes(settings.entryLanguage)
        ? settings.entryLanguage
        : (languages[0] ?? settings.entryLanguage);
  const filter = (Object.keys(FILTER_PARAMS) as GridFilter[]).find((f) => FILTER_PARAMS[f] === params.filtre) ?? "all";
  const visible = filterVariants(variants, filter, quantities, language, settings.duplicateThreshold);
  return { set, release, variants, languages, language, filter, visible };
}

/**
 * Previous and next visible variants around `variantKey`, in the order of the
 * page. If the variant has left the filter (e.g. it is no longer missing), its
 * place in the unfiltered order is used.
 */
export function neighbors(view: Pick<ReleaseView, "variants" | "visible">, variantKey: string): { previous: Variant | null; next: Variant | null } {
  const position = view.variants.findIndex((variant) => variant.key === variantKey);
  if (position === -1) return { previous: null, next: null };
  const visibleKeys = new Set(view.visible.map((variant) => variant.key));
  const before = view.variants.slice(0, position).filter((variant) => visibleKeys.has(variant.key));
  const after = view.variants.slice(position + 1).filter((variant) => visibleKeys.has(variant.key));
  return { previous: before.at(-1) ?? null, next: after[0] ?? null };
}
