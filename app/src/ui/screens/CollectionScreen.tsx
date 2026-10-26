import { useMemo } from "react";
import { Link, useLocation, useSearchParams } from "react-router";
import { localize } from "../../domain/catalog.ts";
import { releasesOfSet } from "../../domain/catalogIndex.ts";
import {
  collectionParams,
  collectionRows,
  type CollectionFilters,
  type CollectionRow,
  type CollectionSort,
  type CollectionSortKey,
  defaultDirection,
  parseCollectionParams,
  quantityIn,
  rarityFilterKey,
  sortRows,
  summarizeRows,
} from "../../domain/collectionView.ts";
import { buildSetTabs, releaseShortName } from "../../domain/setTabs.ts";
import { useI18n } from "../../i18n/i18n.tsx";
import type { MessageKey } from "../../i18n/messages.ts";
import { useIsDesktop } from "../../platform/media.ts";
import { useApp } from "../AppContext.tsx";
import { cardLinkState } from "../cardLink.ts";
import { useDataActions } from "../dataActions.ts";
import { EmptyCollection } from "../EmptyCollection.tsx";
import { useCollection } from "../CollectionContext.tsx";
import { FilterFieldsets, FilterMenus, type FilterGroup } from "../FilterControls.tsx";
import { cardColor, cardColorLabel, cardTypeLabel, languageLabel, rarityColor } from "../labels.ts";
import { useDocumentTitle } from "./useDocumentTitle.ts";
import { useTabLabel } from "./useTabLabel.ts";

type ListFilter = "sets" | "releases" | "rarities" | "types" | "colors";

type CollectionFilterGroup = FilterGroup<ListFilter>;

const MOBILE_SORTS: { key: CollectionSortKey; label: MessageKey }[] = [
  { key: "recent", label: "collection.sort.recent" },
  { key: "number", label: "collection.sort.number" },
  { key: "name", label: "collection.sort.name" },
  { key: "quantity", label: "collection.sort.quantity" },
];

/**
 * Collection (Collection / WebCollection, docs/app-spec.md §5.5, §5.7): one
 * line per owned variant, filters and sort in the URL; a list on mobile, a
 * sortable table on desktop.
 */
export function CollectionScreen() {
  const { entries } = useCollection();
  return entries.size === 0 ? <EmptyCollection /> : <CollectionList />;
}

function CollectionList() {
  const { index, settings, services } = useApp();
  const { entries } = useCollection();
  const { t, language: uiLanguage } = useI18n();
  const isDesktop = useIsDesktop();
  const { exportCsv } = useDataActions();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  useDocumentTitle(t("collection.title"));

  const { filters, sort } = parseCollectionParams(Object.fromEntries(params));
  const languages = index.catalog.languages;
  const displayLanguages = [...languages].sort((a, b) => (a === settings.entryLanguage ? -1 : b === settings.entryLanguage ? 1 : 0));
  const nameLanguage =
    settings.cardNameLanguage !== "entry" ? settings.cardNameLanguage : (filters.language ?? settings.entryLanguage);

  const rows = useMemo(() => {
    const collator = new Intl.Collator(uiLanguage);
    const all = collectionRows(index, entries, filters, settings.duplicateThreshold);
    return sortRows(all, sort, (row) => localize(row.variant.card.name, nameLanguage), collator.compare);
    // `filters` and `sort` are rebuilt from the URL on every render: depend on the URL itself.
  }, [index, entries, params, settings.duplicateThreshold, nameLanguage, uiLanguage]);
  const summary = summarizeRows(rows);

  const update = (next: { filters?: CollectionFilters; sort?: CollectionSort }) =>
    setParams(collectionParams(next.filters ?? filters, next.sort ?? sort), { replace: true });
  const setFilters = (changes: Partial<CollectionFilters>) => update({ filters: { ...filters, ...changes } });
  const chooseSort = (key: CollectionSortKey) =>
    update({ sort: sort.key === key ? { key, direction: sort.direction === "asc" ? "desc" : "asc" } : { key, direction: defaultDirection(key) } });

  const groups = useFilterGroups();
  const setName = (setId: string) => localize(index.sets.get(setId)?.name ?? {}, uiLanguage);
  const releaseLabel = (row: CollectionRow) => releaseShortName(localize(row.variant.release.name, uiLanguage), setName(row.variant.release.setId));
  const rarityName = (row: CollectionRow) => (row.variant.rarity ? localize(row.variant.rarity.name, uiLanguage) : "?");
  const otherLanguage = languages.find((code) => code !== nameLanguage);
  const linkState = (row: CollectionRow) => cardLinkState(location, row.variant.key, filters.language ?? row.owned[0]?.printing.language ?? null);
  const thumbOf = (row: CollectionRow) => {
    const printing = row.owned[0]?.printing;
    return printing?.image ? new URL(printing.image.thumbPath, services.imageBaseUrl).href : null;
  };
  const added = (row: CollectionRow, capitalized: boolean) => formatAdded(row.lastAddedAt, uiLanguage, t, capitalized);

  const languageOptions = [
    { value: null, label: t("collection.allLanguages") },
    ...displayLanguages.map((code) => ({
      value: code,
      label: isDesktop ? t("collection.languageOnly", { language: languageLabel(t, code) }) : languageLabel(t, code),
    })),
  ];

  if (isDesktop) {
    const columns: { key: CollectionSortKey; label: string; align: "left" | "right" }[] = [
      { key: "name", label: t("collection.column.card"), align: "left" },
      { key: "release", label: t("collection.column.release"), align: "left" },
      { key: "number", label: t("collection.column.number"), align: "left" },
      { key: "rarity", label: t("collection.column.rarity"), align: "left" },
      ...displayLanguages.map((code) => ({ key: `quantity-${code}` as CollectionSortKey, label: languageLabel(t, code), align: "right" as const })),
      { key: "recent", label: t("collection.column.added"), align: "left" },
    ];
    return (
      <div className="collection collection--desktop">
        <header className="collection-header">
          <h1>{t("collection.title")}</h1>
          <span className="collection-header__summary">{t("collection.summaryLong", summary)}</span>
          <button type="button" className="secondary-button collection-header__csv" onClick={exportCsv}>
            {t("collection.csv")}
          </button>
        </header>
        <div className="collection-body">
          <aside aria-label={t("collection.filters")} className="filter-panel">
            <fieldset className="filter-group">
              <legend>{t("collection.languages")}</legend>
              {languageOptions.map((option) => (
                <button
                  key={option.value ?? "all"}
                  type="button"
                  aria-pressed={filters.language === option.value}
                  className="filter-option"
                  onClick={() => setFilters({ language: option.value })}
                >
                  {option.label}
                </button>
              ))}
            </fieldset>
            <fieldset className="filter-group">
              <legend>{t("collection.duplicates")}</legend>
              <button type="button" role="switch" aria-checked={filters.duplicates} className="switch" onClick={() => setFilters({ duplicates: !filters.duplicates })}>
                <span className="switch__track">
                  <span className="switch__thumb" />
                </span>
                {t("collection.duplicatesSwitch", { count: settings.duplicateThreshold })}
              </button>
            </fieldset>
            <FilterFieldsets groups={groups} selected={(field) => filters[field]} onChange={(field, values) => setFilters({ [field]: values })} />
          </aside>
          <div className="collection-table-area">
            {rows.length === 0 ? (
              <p className="collection__empty">{t("collection.empty")}</p>
            ) : (
              <div className="collection-table-wrapper">
                <table className="collection-table">
                  <thead>
                    <tr>
                      {columns.map((column) => {
                        const active = sort.key === column.key;
                        return (
                          <th
                            key={column.key}
                            scope="col"
                            aria-sort={active ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}
                            className={`collection-table__head collection-table__head--${column.align}`}
                          >
                            <button type="button" className={active ? "is-active" : ""} onClick={() => chooseSort(column.key)}>
                              {column.label}
                              {active && <span aria-hidden="true">{sort.direction === "asc" ? " ↑" : " ↓"}</span>}
                            </button>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => {
                      const name = localize(row.variant.card.name, nameLanguage);
                      const thumb = thumbOf(row);
                      return (
                        <tr key={row.variant.key}>
                          <td>
                            <Link to={`/cartes/${row.variant.card.slug}`} state={linkState(row)} className="collection-table__card">
                              <span className="mini-card mini-card--small" style={{ borderTopColor: cardColor(row.variant.card.color) }}>
                                {thumb && <img src={thumb} alt="" loading="lazy" decoding="async" />}
                              </span>
                              <span className="collection-table__names">
                                <span className="collection-table__name">{name}</span>
                                {otherLanguage && row.variant.card.name[otherLanguage] && (
                                  <span className="collection-table__other">{localize(row.variant.card.name, otherLanguage)}</span>
                                )}
                              </span>
                            </Link>
                          </td>
                          <td className="secondary">{releaseLabel(row)}</td>
                          <td className="secondary mono">{row.variant.collectorNumber}</td>
                          <td>
                            <span className="rarity-dot-label">
                              <span className="rarity-dot" style={{ background: rarityColor(row.variant.rarity) }} />
                              {rarityName(row)}
                            </span>
                          </td>
                          {displayLanguages.map((code) => (
                            <td key={code} className={`mono collection-table__quantity collection-table__quantity--${code}`}>
                              {quantityIn(row, code) || "—"}
                            </td>
                          ))}
                          <td className="muted nowrap">
                            {added(row, true)}
                            {filters.duplicates && row.surplus > 0 && <span className="surplus"> +{row.surplus}</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="collection">
      <header className="collection-header">
        <div className="collection-header__title">
          <h1>{t("collection.title")}</h1>
          <span className="collection-header__summary">{t("collection.summary", summary)}</span>
          <button type="button" className="secondary-button collection-header__csv" aria-label={t("collection.csv")} onClick={exportCsv}>
            {t("settings.csv")}
          </button>
        </div>
        <div className="chip-row">
          {languageOptions.map((option) => (
            <button
              key={option.value ?? "all"}
              type="button"
              aria-pressed={filters.language === option.value}
              className="filter-pill"
              onClick={() => setFilters({ language: option.value })}
            >
              {option.label}
            </button>
          ))}
          <button type="button" aria-pressed={filters.duplicates} className="filter-pill" onClick={() => setFilters({ duplicates: !filters.duplicates })}>
            {t("collection.duplicates")}
          </button>
        </div>
        <FilterMenus
          groups={groups}
          selected={(field) => filters[field]}
          onChange={(field, values) => setFilters({ [field]: values })}
          panelId="collection-filter-options"
        />
      </header>
      <div className="sort-bar">
        <span className="sort-bar__label">{t("collection.sortBy")}</span>
        <div role="group" aria-label={t("collection.sort")} className="sort-options">
          {MOBILE_SORTS.map((option) => {
            const active = sort.key === option.key;
            return (
              <button key={option.key} type="button" aria-pressed={active} className="sort-option" onClick={() => chooseSort(option.key)}>
                {t(option.label)}
                {active && sort.direction !== defaultDirection(option.key) && <span aria-hidden="true">{sort.direction === "asc" ? " ↑" : " ↓"}</span>}
              </button>
            );
          })}
        </div>
      </div>
      <div className="collection-list">
        {filters.duplicates && <p className="collection-list__note">{t("collection.duplicatesNote", { count: settings.duplicateThreshold })}</p>}
        {rows.map((row) => {
          const name = localize(row.variant.card.name, nameLanguage);
          const thumb = thumbOf(row);
          return (
            <Link key={row.variant.key} to={`/cartes/${row.variant.card.slug}`} state={linkState(row)} className="collection-row" aria-label={t("collection.open", { name })}>
              <span className="mini-card" style={{ borderTopColor: cardColor(row.variant.card.color) }}>
                {thumb && <img src={thumb} alt="" loading="lazy" decoding="async" />}
              </span>
              <span className="collection-row__body">
                <span className="collection-row__name">{name}</span>
                <span className="collection-row__meta">
                  <span className="rarity-dot" style={{ background: rarityColor(row.variant.rarity) }} />
                  {releaseLabel(row)} #{row.variant.collectorNumber} · {rarityName(row)}
                </span>
                <span className="collection-row__added">{added(row, false)}</span>
              </span>
              <span className="collection-row__quantities">
                {displayLanguages
                  .filter((code) => quantityIn(row, code) > 0)
                  .map((code) => (
                    <span key={code} className={`quantity-badge quantity-badge--${code}`}>
                      {languageLabel(t, code)} {quantityIn(row, code)}
                    </span>
                  ))}
                {filters.duplicates && row.surplus > 0 && <span className="surplus">{t("collection.surplus", { count: row.surplus })}</span>}
              </span>
            </Link>
          );
        })}
        {rows.length === 0 && <p className="collection__empty">{t("collection.empty")}</p>}
      </div>
    </div>
  );
}

/** Options of the list filters, from the catalog (spec §5.7: set, release, rarity, type, color). */
function useFilterGroups(): CollectionFilterGroup[] {
  const { index } = useApp();
  const { t, language } = useI18n();
  const tabLabel = useTabLabel();
  return useMemo(() => {
    const sets = [...index.catalog.sets].sort((a, b) => a.order - b.order);
    const releases = new Map<string, string>();
    for (const set of sets) {
      const setName = localize(set.name, language);
      const tabs = buildSetTabs(releasesOfSet(index, set.id), (release) => index.printingsByRelease.has(release.id));
      for (const tab of tabs) if (!releases.has(tab.id)) releases.set(tab.id, tabLabel(tab, setName));
    }
    const rarities = new Map<string, string>();
    for (const rarity of [...index.catalog.rarities].sort((a, b) => a.order - b.order)) {
      const key = rarityFilterKey(rarity);
      if (!rarities.has(key)) rarities.set(key, rarity.iconic ? t("collection.iconic") : localize(rarity.name, language));
    }
    const present = (values: (string | null)[]) => [...new Set(values.filter((v): v is string => v !== null))];
    const types = present(index.catalog.cards.map((card) => card.type));
    const colors = present(index.catalog.cards.map((card) => card.color));
    return [
      { field: "sets", title: "collection.filter.set", options: sets.map((set) => ({ value: set.id, label: localize(set.name, language) })) },
      { field: "releases", title: "collection.filter.release", options: [...releases].map(([value, label]) => ({ value, label })) },
      { field: "rarities", title: "collection.filter.rarity", options: [...rarities].map(([value, label]) => ({ value, label })) },
      { field: "types", title: "collection.filter.type", options: types.map((value) => ({ value, label: cardTypeLabel(t, value) })) },
      { field: "colors", title: "collection.filter.color", options: colors.map((value) => ({ value, label: cardColorLabel(t, value) })) },
    ] satisfies CollectionFilterGroup[];
  }, [index, t, language, tabLabel]);
}

/** "Ajoutée aujourd'hui", "Ajoutée il y a 3 jours", then the date after a month. */
function formatAdded(iso: string, language: string, t: ReturnType<typeof useI18n>["t"], capitalized: boolean): string {
  const day = (date: Date) => Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  const days = Math.round((day(new Date()) - day(new Date(iso))) / 86_400_000);
  if (days <= 30) {
    const when = new Intl.RelativeTimeFormat(language, { numeric: "auto" }).format(-days, "day");
    return capitalized ? when.charAt(0).toUpperCase() + when.slice(1) : t("collection.added", { when });
  }
  const date = new Intl.DateTimeFormat(language, { day: "numeric", month: "short", year: "numeric" }).format(new Date(iso));
  return capitalized ? date : t("collection.addedOn", { date });
}
