import { useCallback, useMemo, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router";
import { localize, type Printing } from "../../domain/catalog.ts";
import { groupBy } from "../../domain/catalogIndex.ts";
import { COST_RANGES, costRange, NO_SEARCH, parseSearchParams, searchCards, searchParams, type SearchFilters, type SearchResult } from "../../domain/search.ts";
import { releaseShortName } from "../../domain/setTabs.ts";
import { useI18n } from "../../i18n/i18n.tsx";
import type { MessageKey } from "../../i18n/messages.ts";
import { useIsDesktop } from "../../platform/media.ts";
import { useApp } from "../AppContext.tsx";
import { cardLinkState } from "../cardLink.ts";
import { useCollection } from "../CollectionContext.tsx";
import { ActiveFilters, type FilterCriterion, FilterPanel, FiltersButton, type FilterModel, type FilterOption } from "../FilterPanel.tsx";
import { colorOptions, rarityOptions, typeOptions } from "../filterOptions.ts";
import { SearchIcon } from "../icons.tsx";
import { cardColor, cardTypeLabel, languageLabel } from "../labels.ts";
import { HeaderIndicators } from "../SyncIndicators.tsx";
import { useDocumentTitle } from "./useDocumentTitle.ts";

type ListField = "possession" | "colors" | "rarities" | "sets" | "costs" | "rams";

const PANEL_ID = "search-filters";

/**
 * Search (Search / WebSearch, docs/app-spec.md §5.6): every card of the
 * catalog, in every language, as you type. One result per card; the query
 * and the filters live in the URL.
 */
export function SearchScreen() {
  const { index, settings, services } = useApp();
  const { quantities } = useCollection();
  const { t, language: uiLanguage } = useI18n();
  const isDesktop = useIsDesktop();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const [panelOpen, setPanelOpen] = useState(false);
  const closePanel = useCallback(() => setPanelOpen(false), []);
  useDocumentTitle(t("search.title"));

  const filters = parseSearchParams(Object.fromEntries(params));
  const displayLanguage = settings.cardNameLanguage === "entry" ? settings.entryLanguage : settings.cardNameLanguage;
  const results = useMemo(
    () => searchCards(index, quantities, filters, displayLanguage, new Intl.Collator(uiLanguage).compare),
    // `filters` is rebuilt from the URL on every render: depend on the URL itself.
    [index, quantities, params, displayLanguage, uiLanguage],
  );
  const update = (changes: Partial<SearchFilters>) => setParams(searchParams({ ...filters, ...changes }), { replace: true });

  const listOptions = useSearchListOptions();
  // "VF et VO": the entry language first, as in the mockups.
  const languageList = [...index.catalog.languages]
    .sort((a, b) => (a === settings.entryLanguage ? -1 : b === settings.entryLanguage ? 1 : 0))
    .map((code) => languageLabel(t, code));
  const languagesText = languageList.length === 2 ? t("language.and", { a: languageList[0]!, b: languageList[1]! }) : languageList.join(", ");

  const otherLanguage = index.catalog.languages.find((code) => code !== displayLanguage);
  const setName = (setId: string) => localize(index.sets.get(setId)?.name ?? {}, uiLanguage);
  const printingsSummary = (printings: Printing[]) =>
    [...groupBy(printings, (printing) => printing.releaseId)]
      .map(([releaseId, list]) => {
        const release = index.releases.get(releaseId)!;
        const numbers = [...new Set(list.map((printing) => `#${printing.collectorNumber}`))];
        return [releaseShortName(localize(release.name, uiLanguage), setName(release.setId)), ...numbers].join(" ");
      })
      .join(" · ");
  const describe = (result: SearchResult) => {
    const primary = localize(result.card.name, displayLanguage);
    const other = otherLanguage && result.card.name[otherLanguage];
    const secondary = other
      ? result.match === "otherName"
        ? t("card.otherName", { language: languageLabel(t, otherLanguage), name: other })
        : other
      : null;
    return { primary, secondary, meta: `${cardTypeLabel(t, result.card.type)} · ${printingsSummary(result.printings)}` };
  };
  const thumbOf = (result: SearchResult) => {
    const printing = result.printings.find((p) => p.language === displayLanguage && p.image) ?? result.printings.find((p) => p.image);
    return printing?.image ? new URL(printing.image.thumbPath, services.imageBaseUrl).href : null;
  };
  const ownership = (result: SearchResult) => (
    <span className={`ownership ${result.copies > 0 ? "ownership--owned" : ""}`}>
      {result.copies > 0 ? t("search.owned", { count: result.copies }) : t("search.missing")}
    </span>
  );
  const link = (result: SearchResult) => ({ to: `/cartes/${result.card.slug}`, state: cardLinkState(location, null, null) });

  const searchField = (
    <div className="search-field">
      <label htmlFor="search-query" className="visually-hidden">
        {t("search.label")}
      </label>
      <SearchIcon width={20} height={20} />
      <input
        id="search-query"
        type="search"
        value={filters.query}
        placeholder={t("search.placeholder")}
        autoComplete="off"
        spellCheck={false}
        onChange={(event) => update({ query: event.target.value })}
      />
    </div>
  );
  const filterModel: FilterModel = {
    label: t("search.filters"),
    resultCount: results.length,
    onReset: () => update({ ...NO_SEARCH, query: filters.query }),
    criteria: [
      {
        kind: "chips",
        id: "types",
        title: t("search.filter.type"),
        single: { allLabel: t("search.allTypes") },
        options: typeOptions(index, t),
        selected: filters.types,
        onChange: (types) => update({ types }),
      },
      ...listOptions.map(
        ({ field, title, options }): FilterCriterion => ({
          kind: "chips",
          id: field,
          title: t(title),
          options,
          selected: filters[field],
          onChange: (values) => update({ [field]: values }),
        }),
      ),
      {
        kind: "checkbox",
        id: "rules",
        title: t("search.filter.text"),
        label: t("search.includeRules"),
        activeLabel: t("search.rulesChip"),
        checked: filters.includeRules,
        onChange: (includeRules) => update({ includeRules }),
      },
    ],
  };
  const filtersButton = <FiltersButton model={filterModel} open={panelOpen} onToggle={() => setPanelOpen((open) => !open)} panelId={PANEL_ID} />;
  const filterPanel = <FilterPanel model={filterModel} open={panelOpen} onClose={closePanel} panelId={PANEL_ID} />;
  const resultsLabel = <p className="search-results__count">{t("search.results", { count: results.length, languages: languagesText })}</p>;
  const empty = results.length === 0 && <p className="collection__empty">{t("search.empty")}</p>;

  if (isDesktop) {
    return (
      <div className="search search--desktop">
        <header className="search-header">
          <h1>{t("search.title")}</h1>
          <div className="search-header__row">
            {searchField}
            {filtersButton}
          </div>
        </header>
        {filterPanel}
        <div className="collection-body">
          <div className="search-results">
            <ActiveFilters model={filterModel} className="active-filters--results" />
            {resultsLabel}
            <div className="result-grid">
              {results.map((result) => {
                const { primary, secondary, meta } = describe(result);
                const thumb = thumbOf(result);
                return (
                  <Link key={result.card.id} {...link(result)} className="result-card">
                    <span className="result-card__stripe" style={{ background: cardColor(result.card.color) }} />
                    <span className="result-card__image">
                      {thumb && <img src={thumb} alt="" crossOrigin="anonymous" loading="lazy" decoding="async" />}
                      {ownership(result)}
                    </span>
                    <span className="result-card__body">
                      <span className="result-card__name">{primary}</span>
                      {secondary && <span className="result-card__secondary">{secondary}</span>}
                      <span className="result-card__meta">{meta}</span>
                    </span>
                  </Link>
                );
              })}
            </div>
            {empty}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="search">
      <header className="collection-header">
        <div className="search-header__row">
          {searchField}
          {filtersButton}
          <HeaderIndicators />
        </div>
        <ActiveFilters model={filterModel} className="active-filters--toolbar" />
      </header>
      <div className="collection-list">
        {resultsLabel}
        {results.map((result) => {
          const { primary, secondary, meta } = describe(result);
          const thumb = thumbOf(result);
          return (
            <Link key={result.card.id} {...link(result)} className="collection-row">
              <span className="mini-card" style={{ borderTopColor: cardColor(result.card.color) }}>
                {thumb && <img src={thumb} alt="" crossOrigin="anonymous" loading="lazy" decoding="async" />}
              </span>
              <span className="collection-row__body">
                <span className="collection-row__name">{primary}</span>
                {secondary && <span className="collection-row__meta">{secondary}</span>}
                <span className="search-row__meta">{meta}</span>
              </span>
              {ownership(result)}
            </Link>
          );
        })}
        {empty}
      </div>
      {filterPanel}
    </div>
  );
}

/** Options of the search filters after the type, from the catalog (spec §5.6), in the order of the panel. */
function useSearchListOptions(): { field: ListField; title: MessageKey; options: FilterOption[] }[] {
  const { index } = useApp();
  const { t, language } = useI18n();
  return useMemo(() => {
    const present = <T,>(values: (T | null)[]) => [...new Set(values.filter((v): v is T => v !== null))];
    const costs = new Set(present(index.catalog.cards.map((card) => card.cost)).map(costRange));
    const rams = present(index.catalog.cards.map((card) => card.ram)).sort((a, b) => a - b);
    return [
      {
        field: "possession" as const,
        title: "search.filter.possession" as const,
        options: [
          { value: "owned", label: t("search.possession.owned") },
          { value: "missing", label: t("search.possession.missing") },
        ],
      },
      { field: "colors" as const, title: "collection.filter.color" as const, options: colorOptions(index, t) },
      { field: "rarities" as const, title: "collection.filter.rarity" as const, options: rarityOptions(index, t, language) },
      {
        field: "sets" as const,
        title: "collection.filter.set" as const,
        options: [...index.catalog.sets].sort((a, b) => a.order - b.order).map((set) => ({ value: set.id, label: localize(set.name, language) })),
      },
      {
        field: "costs" as const,
        title: "search.filter.cost" as const,
        options: COST_RANGES.filter((range) => costs.has(range)).map((value) => {
          const label = t(`search.cost.${value}` as MessageKey);
          return { value, label, activeLabel: t("search.costChip", { range: label }) };
        }),
      },
      {
        field: "rams" as const,
        title: "search.filter.ram" as const,
        options: rams.map((value) => ({ value: String(value), label: String(value), activeLabel: t("search.ramChip", { ram: value }) })),
      },
    ];
  }, [index, t, language]);
}
