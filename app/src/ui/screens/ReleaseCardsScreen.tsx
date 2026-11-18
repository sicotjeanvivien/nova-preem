import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useParams, useSearchParams } from "react-router";
import { localize } from "../../domain/catalog.ts";
import type { CatalogIndex } from "../../domain/catalogIndex.ts";
import { percentFloor, releaseVariants } from "../../domain/completion.ts";
import { formatMissingList } from "../../domain/missingList.ts";
import {
  activeCardFilterCount,
  type CardFilterField,
  cardFilterParams,
  computeReleaseView,
  FILTER_PARAMS,
  NO_CARD_FILTERS,
  type ReleaseCardFilters,
  type ReleaseView,
} from "../../domain/releaseView.ts";
import { releaseShortName } from "../../domain/setTabs.ts";
import { ownedInOtherLanguages, type GridFilter, type Variant } from "../../domain/variants.ts";
import { useI18n } from "../../i18n/i18n.tsx";
import type { MessageKey } from "../../i18n/messages.ts";
import { useIsDesktop } from "../../platform/media.ts";
import { useApp } from "../AppContext.tsx";
import { CardTile } from "../CardTile.tsx";
import { useCollection, type QuantityChange } from "../CollectionContext.tsx";
import { ChevronLeftIcon } from "../icons.tsx";
import { ActiveFilters, FilterPanel, FiltersButton, type FilterModel, type FilterOption } from "../FilterPanel.tsx";
import { cardColor, cardColorLabel, cardTypeLabel, languageLabel, rarityColor, rarityShort } from "../labels.ts";
import { ProgressBar } from "../ProgressBar.tsx";
import { Toast } from "../Toast.tsx";
import { useDocumentTitle } from "./useDocumentTitle.ts";

const FILTERS: { id: GridFilter; label: MessageKey }[] = [
  { id: "all", label: "filter.all" },
  { id: "missing", label: "filter.missing" },
  { id: "owned", label: "filter.owned" },
  { id: "duplicates", label: "filter.duplicates" },
];

const TOAST_DURATION_MS = 5000;
const PANEL_ID = "release-card-filters";

type ToastState = { id: number; text: string; change: QuantityChange | null };

/**
 * Sets, level 3 (SetGrid / WebSets, spec §2.1, §5.1, §5.4): the cards of a
 * release, the entry screen. Each tile has − quantity +; the image and the
 * name open the card page. Possession filter, entry language and card filters
 * (§5.1.1) live in the URL.
 */
export function ReleaseCardsScreen() {
  const { setId = "", releaseId = "" } = useParams();
  const { index, settings } = useApp();
  const { quantities, change, undo } = useCollection();
  const { t, language: uiLanguage } = useI18n();
  const isDesktop = useIsDesktop();
  const [params, setParams] = useSearchParams();

  const view = useMemo(
    () => computeReleaseView(index, setId, releaseId, Object.fromEntries(params), settings, quantities),
    [index, setId, releaseId, params, settings, quantities],
  );
  const setName = view ? localize(view.set.name, uiLanguage) : "";
  const releaseName = view ? releaseShortName(localize(view.release.name, uiLanguage), setName) : "";
  useDocumentTitle(view ? `${releaseName} · ${setName}` : "");

  const [panelOpen, setPanelOpen] = useState(false);
  const closePanel = useCallback(() => setPanelOpen(false), []);
  const [toast, setToast] = useState<ToastState | null>(null);
  const toastId = useRef(0);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), TOAST_DURATION_MS);
    return () => clearTimeout(timer);
  }, [toast]);

  const updateParams = useCallback(
    (changes: Record<string, string | null>) =>
      setParams(
        (current) => {
          const next = new URLSearchParams(current);
          for (const [key, value] of Object.entries(changes)) {
            if (value === null) next.delete(key);
            else next.set(key, value);
          }
          return next;
        },
        { replace: true },
      ),
    [setParams],
  );

  const filterModel = useCardFilterModel(view?.cardFilters ?? NO_CARD_FILTERS, view, (filters) => updateParams(cardFilterParams(filters)));

  if (!view) return <Navigate to={index.sets.has(setId) ? `/sets/${setId}` : "/sets"} replace />;
  const { release, languages, language, filter, visible } = view;
  const filtered = activeCardFilterCount(view.cardFilters) > 0;
  const nameLanguage = settings.cardNameLanguage === "entry" ? language : settings.cardNameLanguage;
  const cardName = (variant: Variant) => localize(variant.card.name, nameLanguage);
  const progress = releaseVariants(index, [release.id], quantities);
  const showToast = (text: string, quantityChange: QuantityChange | null) => setToast({ id: ++toastId.current, text, change: quantityChange });

  const changeQuantity = (variant: Variant, delta: number) => {
    const printing = variant.printings.get(language);
    if (!printing) return;
    const result = change(printing.id, delta);
    if (!result) return;
    showToast(t(delta > 0 ? "setPage.added" : "setPage.removed", { name: cardName(variant), language: languageLabel(t, language) }), result);
  };

  const copyMissing = async () => {
    const text = formatMissingList(
      t("setPage.missingTitle", { set: setName, release: releaseName, language: languageLabel(t, language) }),
      visible.map((variant) => {
        const others = ownedInOtherLanguages(variant, quantities, language).map((code) => t("tile.ownedIn", { language: languageLabel(t, code) }));
        return {
          number: variant.collectorNumber,
          name: cardName(variant),
          rarity: rarityShort(t, variant.rarity),
          ...(others.length > 0 && { note: others.join(" · ") }),
        };
      }),
    );
    try {
      await navigator.clipboard.writeText(text);
      showToast(t("setPage.copied"), null);
    } catch {
      showToast(t("setPage.copyFailed"), null);
    }
  };

  const languageSelector = languages.length > 1 && (
    <>
      <span className="toolbar__hint">{t("cards.quantitiesIn")}</span>
      <div role="group" aria-label={t("cards.languageGroup")} className="segmented">
        {[...languages]
          .sort((a, b) => (a === settings.entryLanguage ? -1 : b === settings.entryLanguage ? 1 : 0))
          .map((code) => (
            <button
              key={code}
              type="button"
              aria-pressed={code === language}
              className={`segmented__option segmented__option--${code}`}
              onClick={() => updateParams({ langue: code })}
            >
              {languageLabel(t, code)}
            </button>
          ))}
      </div>
    </>
  );
  const filtersButton = <FiltersButton model={filterModel} open={panelOpen} onToggle={() => setPanelOpen((open) => !open)} panelId={PANEL_ID} />;
  const activeFilters = (
    <ActiveFilters
      model={filterModel}
      summary={t("filters.ratio", { shown: visible.length, total: view.variants.length })}
      className={isDesktop ? "active-filters--page" : "active-filters--toolbar"}
    />
  );
  const filterButtons = (
    <div role="group" aria-label={t("setPage.filters")} className="toolbar__filters">
      {FILTERS.map((f) => (
        <button key={f.id} type="button" aria-pressed={f.id === filter} className="filter-pill" onClick={() => updateParams({ filtre: FILTER_PARAMS[f.id] })}>
          {t(f.label)}
        </button>
      ))}
    </div>
  );

  return (
    <div className="cards-screen">
      <div className="cards-screen__top">
        {isDesktop ? (
          <header className="level-header level-header--cards">
            <div className="level-header__titles">
              <span className="level-header__crumbs">
                <Link to="/sets">{t("sets.title")}</Link> / <Link to={`/sets/${view.set.id}`}>{setName}</Link>
              </span>
              <h1 className="level-header__title">{releaseName}</h1>
            </div>
            <div className="level-header__progress">
              <ProgressBar progress={progress} color="var(--color-accent)" className="level-header__bar" label={t("setPage.variantsOwned")} />
              <span className="level-header__ratio">
                {t("sets.ratio", progress)} · {percentFloor(progress)}&nbsp;%
              </span>
            </div>
          </header>
        ) : (
          <header className="level-bar">
            <Link to={`/sets/${view.set.id}`} className="icon-button" aria-label={t("card.backAria", { label: setName })}>
              <ChevronLeftIcon width={22} height={22} />
            </Link>
            <div className="level-bar__titles">
              <span className="level-bar__eyebrow">{setName}</span>
              <h1 className="level-bar__title level-bar__title--large">{releaseName}</h1>
            </div>
            <div className="level-bar__progress">
              <div className="level-bar__ratio">{t("sets.ratio", progress)}</div>
              <div className="level-bar__caption">{t("setPage.variantsOwned")}</div>
            </div>
          </header>
        )}

        <div className="toolbar">
          {isDesktop ? (
            <>
              {languageSelector}
              {languageSelector && <span className="toolbar__separator" aria-hidden="true" />}
              {filterButtons}
              <span className="toolbar__separator" aria-hidden="true" />
              {filtersButton}
              {filter === "missing" && (
                <button type="button" className="secondary-button toolbar__copy" onClick={() => void copyMissing()} disabled={visible.length === 0}>
                  {t(filtered ? "setPage.copyMissingFiltered" : "setPage.copyMissing", { count: visible.length })}
                </button>
              )}
            </>
          ) : (
            <>
              <div className="toolbar__entry">
                {languageSelector}
                {filtersButton}
              </div>
              {filterButtons}
              {activeFilters}
              {filter === "missing" && (
                <div className="toolbar__missing">
                  <span className="toolbar__missing-count">{t(filtered ? "cards.missingCountFiltered" : "cards.missingCount", { count: visible.length })}</span>
                  <button type="button" className="secondary-button" onClick={() => void copyMissing()} disabled={visible.length === 0}>
                    {t("setPage.copyList")}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
        {isDesktop && <FilterPanel model={filterModel} open={panelOpen} onClose={closePanel} panelId={PANEL_ID} />}
      </div>

      {isDesktop && activeFilters}
      <div className="tile-grid">
        {visible.map((variant) => (
          <CardTile
            key={variant.key}
            variant={variant}
            language={language}
            name={cardName(variant)}
            quantities={quantities}
            onChange={(delta) => changeQuantity(variant, delta)}
          />
        ))}
      </div>
      {visible.length === 0 && (
        <div className="set-page__empty">
          <p>{t("setPage.empty")}</p>
          {filtered && (
            <button type="button" className="secondary-button" onClick={filterModel.onReset}>
              {t("cards.clearFilters")}
            </button>
          )}
        </div>
      )}
      {!isDesktop && <FilterPanel model={filterModel} open={panelOpen} onClose={closePanel} panelId={PANEL_ID} />}

      {toast && (
        <Toast
          key={toast.id}
          text={toast.text}
          {...(toast.change && {
            onUndo: () => {
              undo(toast.change!);
              setToast(null);
            },
          })}
        />
      )}
    </div>
  );
}

/**
 * Card filters of the page (spec §5.1.1) for the common filter panel (§8.1):
 * name or number, rarity, type, color and cost, with the number of cards each
 * option would give.
 */
function useCardFilterModel(
  filters: ReleaseCardFilters,
  view: Pick<ReleaseView, "cardOptions" | "counts" | "visible"> | null,
  onChange: (filters: ReleaseCardFilters) => void,
): FilterModel {
  const { index } = useApp();
  const { t, language } = useI18n();
  const isDesktop = useIsDesktop();
  const options = (field: CardFilterField, describe: (value: string) => Omit<FilterOption, "value" | "count">): FilterOption[] =>
    (view?.cardOptions[field] ?? []).map((value) => ({ value, count: view?.counts[field]?.get(value) ?? 0, ...describe(value) }));
  const chips = (field: CardFilterField, title: MessageKey, describe: (value: string) => Omit<FilterOption, "value" | "count">) => ({
    kind: "chips" as const,
    id: field,
    title: t(title),
    options: options(field, describe),
    selected: filters[field],
    onChange: (values: string[]) => onChange({ ...filters, [field]: values }),
  });
  return {
    label: t("cards.filters"),
    resultCount: view?.visible.length ?? 0,
    onReset: () => onChange(NO_CARD_FILTERS),
    note: t(isDesktop ? "cards.filtersNoteDesktop" : "cards.filtersNote"),
    criteria: [
      {
        kind: "text",
        id: "query",
        title: t("cards.filter.query"),
        value: filters.query,
        placeholder: t("cards.filter.queryPlaceholder"),
        onChange: (query) => onChange({ ...filters, query }),
      },
      chips("rarities", "collection.filter.rarity", (id) => rarityOption(index, id, language)),
      chips("types", "collection.filter.type", (type) => ({ label: cardTypeLabel(t, type) })),
      chips("colors", "collection.filter.color", (color) => ({ label: cardColorLabel(t, color), dot: cardColor(color) })),
      chips("costs", "search.filter.cost", (range) => ({ label: t(`search.cost.${range}` as MessageKey) })),
    ],
  };
}

function rarityOption(index: CatalogIndex, id: string, language: string): Omit<FilterOption, "value" | "count"> {
  const rarity = index.rarities.get(id);
  return { label: rarity ? localize(rarity.name, language) : id, dot: rarityColor(rarity) };
}
