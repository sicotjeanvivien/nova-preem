import type { CatalogSet } from "./catalog.ts";
import { type CatalogIndex, releasesOfSet } from "./catalogIndex.ts";
import type { Settings } from "./settings.ts";
import { buildSetTabs, selectTab, type SetTab, type TabSelection } from "./setTabs.ts";
import { filterVariants, type GridFilter, languagesOf, type Quantities, type Variant, variantsOf } from "./variants.ts";

/** URL parameters of a set page (docs/app-spec.md §2.1): `?tirage=…&filtre=…&langue=…`. */
export interface SetViewParams {
  tirage: string | null;
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

export interface SetView {
  set: CatalogSet;
  tabs: SetTab[];
  selection: TabSelection;
  /** Every variant of the selection, in order. */
  variants: Variant[];
  /** Languages of the selection; the VF/VO selector is shown when there are several. */
  languages: string[];
  /** Entry language. */
  language: string;
  filter: GridFilter;
  /** Variants shown, after the filter. */
  visible: Variant[];
}

/**
 * What a set page shows for given URL parameters. Used by the set page itself
 * and by the card page, which browses the same list (previous / next, §5.9).
 */
export function computeSetView(
  index: CatalogIndex,
  setId: string,
  params: SetViewParams,
  settings: Pick<Settings, "entryReleaseId" | "entryLanguage" | "duplicateThreshold">,
  quantities: Quantities,
): SetView | null {
  const set = index.sets.get(setId);
  if (!set) return null;
  const tabs = buildSetTabs(releasesOfSet(index, setId), (release) => index.printingsByRelease.has(release.id));
  const selection = selectTab(tabs, params.tirage, settings.entryReleaseId);
  if (!selection) return null;
  const variants = variantsOf(index, selection.releases);
  const languages = languagesOf(variants, index.catalog.languages);
  const language =
    params.langue && languages.includes(params.langue)
      ? params.langue
      : languages.includes(settings.entryLanguage)
        ? settings.entryLanguage
        : (languages[0] ?? settings.entryLanguage);
  const filter = (Object.keys(FILTER_PARAMS) as GridFilter[]).find((f) => FILTER_PARAMS[f] === params.filtre) ?? "all";
  const visible = filterVariants(variants, filter, quantities, language, settings.duplicateThreshold);
  return { set, tabs, selection, variants, languages, language, filter, visible };
}

/**
 * Previous and next visible variants around `variantKey`, in the order of the
 * page. If the variant has left the filter (e.g. it is no longer missing), its
 * place in the unfiltered order is used.
 */
export function neighbors(view: SetView, variantKey: string): { previous: Variant | null; next: Variant | null } {
  const position = view.variants.findIndex((variant) => variant.key === variantKey);
  if (position === -1) return { previous: null, next: null };
  const visibleKeys = new Set(view.visible.map((variant) => variant.key));
  const before = view.variants.slice(0, position).filter((variant) => visibleKeys.has(variant.key));
  const after = view.variants.slice(position + 1).filter((variant) => visibleKeys.has(variant.key));
  return { previous: before.at(-1) ?? null, next: after[0] ?? null };
}
