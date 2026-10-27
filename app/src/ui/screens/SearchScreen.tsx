import { useMemo } from "react";
import { Link, useLocation, useSearchParams } from "react-router";
import { localize, type Printing } from "../../domain/catalog.ts";
import { groupBy } from "../../domain/catalogIndex.ts";
import { rarityFilterKey } from "../../domain/collectionView.ts";
import { COST_RANGES, costRange, parseSearchParams, searchCards, searchParams, type SearchFilters, type SearchResult } from "../../domain/search.ts";
import { releaseShortName } from "../../domain/setTabs.ts";
import { useI18n } from "../../i18n/i18n.tsx";
import type { MessageKey } from "../../i18n/messages.ts";
import { useIsDesktop } from "../../platform/media.ts";
import { useApp } from "../AppContext.tsx";
import { cardLinkState } from "../cardLink.ts";
import { useCollection } from "../CollectionContext.tsx";
import { FilterFieldsets, FilterMenus, type FilterGroup } from "../FilterControls.tsx";
import { SearchIcon } from "../icons.tsx";
import { cardColor, cardColorLabel, cardTypeLabel, languageLabel } from "../labels.ts";
import { useDocumentTitle } from "./useDocumentTitle.ts";

type ListField = "possession" | "colors" | "rarities" | "sets" | "costs" | "rams";

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
  useDocumentTitle(t("search.title"));

  const filters = parseSearchParams(Object.fromEntries(params));
  const displayLanguage = settings.cardNameLanguage === "entry" ? settings.entryLanguage : settings.cardNameLanguage;
  const results = useMemo(
    () => searchCards(index, quantities, filters, displayLanguage, new Intl.Collator(uiLanguage).compare),
    // `filters` is rebuilt from the URL on every render: depend on the URL itself.
    [index, quantities, params, displayLanguage, uiLanguage],
  );
  const update = (changes: Partial<SearchFilters>) => setParams(searchParams({ ...filters, ...changes }), { replace: true });

  const groups = useSearchFilterGroups();
  const types = [...new Set(index.catalog.cards.map((card) => card.type))];
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
  const rulesCheckbox = (
    <label className="checkbox">
      <input type="checkbox" checked={filters.includeRules} onChange={(event) => update({ includeRules: event.target.checked })} />
      {t("search.includeRules")}
    </label>
  );
  const typeOptions = [
    { value: null, label: t("search.allTypes") },
    ...types.map((type) => ({ value: type, label: cardTypeLabel(t, type) })),
  ];
  const typeSelected = (value: string | null) => (value === null ? filters.types.length === 0 : filters.types.length === 1 && filters.types[0] === value);
  const selected = (field: ListField) => filters[field];
  const onChange = (field: ListField, values: string[]) => update({ [field]: values });
  const resultsLabel = <p className="search-results__count">{t("search.results", { count: results.length, languages: languagesText })}</p>;
  const empty = results.length === 0 && <p className="collection__empty">{t("search.empty")}</p>;

  if (isDesktop) {
    return (
      <div className="search search--desktop">
        <header className="search-header">
          <h1>{t("search.title")}</h1>
          {searchField}
        </header>
        <div className="collection-body">
          <aside aria-label={t("search.filters")} className="filter-panel">
            <fieldset className="filter-group">
              <legend>{t("search.filter.type")}</legend>
              {typeOptions.map((option) => (
                <button
                  key={option.value ?? "all"}
                  type="button"
                  aria-pressed={typeSelected(option.value)}
                  className="filter-option"
                  onClick={() => update({ types: option.value ? [option.value] : [] })}
                >
                  {option.label}
                </button>
              ))}
            </fieldset>
            <FilterFieldsets groups={groups} selected={selected} onChange={onChange} />
            {rulesCheckbox}
          </aside>
          <div className="search-results">
            {resultsLabel}
            <div className="result-grid">
              {results.map((result) => {
                const { primary, secondary, meta } = describe(result);
                const thumb = thumbOf(result);
                return (
                  <Link key={result.card.id} {...link(result)} className="result-card">
                    <span className="result-card__stripe" style={{ background: cardColor(result.card.color) }} />
                    <span className="result-card__image">
                      {thumb && <img src={thumb} alt="" loading="lazy" decoding="async" />}
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
        {searchField}
        <div className="chip-row">
          {typeOptions.map((option) => (
            <button
              key={option.value ?? "all"}
              type="button"
              aria-pressed={typeSelected(option.value)}
              className="filter-pill"
              onClick={() => update({ types: option.value ? [option.value] : [] })}
            >
              {option.label}
            </button>
          ))}
        </div>
        {rulesCheckbox}
        <FilterMenus groups={groups} selected={selected} onChange={onChange} panelId="search-filter-options" />
      </header>
      <div className="collection-list">
        {resultsLabel}
        {results.map((result) => {
          const { primary, secondary, meta } = describe(result);
          const thumb = thumbOf(result);
          return (
            <Link key={result.card.id} {...link(result)} className="collection-row">
              <span className="mini-card" style={{ borderTopColor: cardColor(result.card.color) }}>
                {thumb && <img src={thumb} alt="" loading="lazy" decoding="async" />}
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
    </div>
  );
}

/** Options of the search filters, from the catalog (spec §5.6). */
function useSearchFilterGroups(): FilterGroup<ListField>[] {
  const { index } = useApp();
  const { t, language } = useI18n();
  return useMemo(() => {
    const present = <T,>(values: (T | null)[]) => [...new Set(values.filter((v): v is T => v !== null))];
    const rarities = new Map<string, string>();
    for (const rarity of [...index.catalog.rarities].sort((a, b) => a.order - b.order)) {
      const key = rarityFilterKey(rarity);
      if (!rarities.has(key)) rarities.set(key, rarity.iconic ? t("collection.iconic") : localize(rarity.name, language));
    }
    const costs = new Set(present(index.catalog.cards.map((card) => card.cost)).map(costRange));
    const rams = present(index.catalog.cards.map((card) => card.ram)).sort((a, b) => a - b);
    return [
      {
        field: "possession",
        title: "search.filter.possession",
        options: [
          { value: "owned", label: t("search.possession.owned") },
          { value: "missing", label: t("search.possession.missing") },
        ],
      },
      {
        field: "colors",
        title: "collection.filter.color",
        options: present(index.catalog.cards.map((card) => card.color)).map((value) => ({ value, label: cardColorLabel(t, value) })),
      },
      { field: "rarities", title: "collection.filter.rarity", options: [...rarities].map(([value, label]) => ({ value, label })) },
      {
        field: "sets",
        title: "collection.filter.set",
        options: [...index.catalog.sets].sort((a, b) => a.order - b.order).map((set) => ({ value: set.id, label: localize(set.name, language) })),
      },
      {
        field: "costs",
        title: "search.filter.cost",
        options: COST_RANGES.filter((range) => costs.has(range)).map((value) => ({ value, label: t(`search.cost.${value}` as MessageKey) })),
      },
      { field: "rams", title: "search.filter.ram", options: rams.map((value) => ({ value: String(value), label: String(value) })) },
    ] satisfies FilterGroup<ListField>[];
  }, [index, t, language]);
}
