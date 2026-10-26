import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router";
import { localize } from "../../domain/catalog.ts";
import { releasesOfSet } from "../../domain/catalogIndex.ts";
import {
  activeFilterCount,
  COLLECTION_SORTS,
  collectionParams,
  collectionRows,
  type CollectionFilters,
  type CollectionRow,
  type CollectionSort,
  NO_FILTERS,
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
import { useCollection } from "../CollectionContext.tsx";
import { EmptyCollection } from "../EmptyCollection.tsx";
import { FilterFieldsets, type FilterGroup } from "../FilterControls.tsx";
import { FiltersIcon, ImageIcon } from "../icons.tsx";
import { cardColor, cardColorLabel, cardTypeLabel, languageLabel, rarityColor, rarityShort } from "../labels.ts";
import { useDocumentTitle } from "./useDocumentTitle.ts";
import { useTabLabel } from "./useTabLabel.ts";

type ListFilter = "sets" | "releases" | "rarities" | "types" | "colors";
type CollectionFilterGroup = FilterGroup<ListFilter>;

const SIZE = { min: 140, max: 280, step: 20 };

/**
 * Collection (Collection / WebCollection, docs/app-spec.md §5.5, §5.7): a
 * gallery to admire what is owned. One large card image per owned variant,
 * with its quantities per language; a click opens the card page. Filters,
 * name and sort live in the URL, so the card page's back button returns to
 * the same gallery.
 */
export function CollectionScreen() {
  const { entries } = useCollection();
  return entries.size === 0 ? <EmptyCollection /> : <CollectionGallery />;
}

function CollectionGallery() {
  const { index, settings, updateSettings } = useApp();
  const { entries } = useCollection();
  const { t, language: uiLanguage } = useI18n();
  const isDesktop = useIsDesktop();
  const [params, setParams] = useSearchParams();
  const [panelOpen, setPanelOpen] = useState(false);
  useDocumentTitle(t("collection.title"));

  const { filters, sort } = parseCollectionParams(Object.fromEntries(params));
  const displayLanguages = [...index.catalog.languages].sort((a, b) => (a === settings.entryLanguage ? -1 : b === settings.entryLanguage ? 1 : 0));
  const nameLanguage = settings.cardNameLanguage !== "entry" ? settings.cardNameLanguage : (filters.language ?? settings.entryLanguage);

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
  const resetFilters = () => setFilters({ ...NO_FILTERS, query: filters.query });

  const groups = useFilterGroups();
  const languageOptions = [null, ...displayLanguages];
  const activeCount = activeFilterCount(filters);

  const nameFilter = (
    <>
      <label htmlFor="collection-name" className="visually-hidden">
        {t("collection.nameFilterLabel")}
      </label>
      <input
        id="collection-name"
        type="search"
        className="name-filter collection-name"
        placeholder={t("collection.nameFilter")}
        value={filters.query}
        autoComplete="off"
        onChange={(event) => setFilters({ query: event.target.value })}
      />
    </>
  );
  const sortSelect = (
    <select id="collection-sort" className="sort-select" value={sort} onChange={(event) => update({ sort: event.target.value as CollectionSort })}>
      {COLLECTION_SORTS.map((key) => (
        <option key={key} value={key}>
          {t(`collection.sort.${key}` as MessageKey)}
        </option>
      ))}
    </select>
  );
  const gallery = (
    <>
      <div className="gallery" style={isDesktop ? { gridTemplateColumns: `repeat(auto-fill, minmax(${settings.collectionCardSize}px, 1fr))` } : undefined}>
        {rows.map((row) => (
          <GalleryCard
            key={row.variant.key}
            row={row}
            name={localize(row.variant.card.name, nameLanguage)}
            languages={displayLanguages}
            showSurplus={filters.duplicates}
            compactSurplus={!isDesktop}
            imageWidth={isDesktop ? `${settings.collectionCardSize + 40}px` : "50vw"}
            linkLanguage={filters.language}
          />
        ))}
      </div>
      {rows.length === 0 && <p className="collection__empty">{t("collection.empty")}</p>}
    </>
  );

  if (isDesktop) {
    return (
      <div className="collection collection--desktop">
        <header className="collection-header">
          <h1>{t("collection.title")}</h1>
          {nameFilter}
          <label htmlFor="collection-sort" className="collection-header__sort-label">
            {t("collection.sortLabel")}
          </label>
          {sortSelect}
          <span className="collection-header__summary">{t("collection.summaryLong", summary)}</span>
        </header>
        <div className="collection-body">
          <aside aria-label={t("collection.filters")} className="filter-panel">
            <fieldset className="filter-group">
              <legend>{t("collection.languages")}</legend>
              {languageOptions.map((code) => (
                <button key={code ?? "all"} type="button" aria-pressed={filters.language === code} className="filter-option" onClick={() => setFilters({ language: code })}>
                  {code ? t("collection.languageOnly", { language: languageLabel(t, code) }) : t("collection.allLanguages")}
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
          <div className="gallery-area">
            {gallery}
            <div className="card-size">
              <label htmlFor="collection-size">{t("collection.cardSize")}</label>
              <input
                id="collection-size"
                type="range"
                min={SIZE.min}
                max={SIZE.max}
                step={SIZE.step}
                value={settings.collectionCardSize}
                onChange={(event) => updateSettings({ collectionCardSize: Number(event.target.value) })}
              />
            </div>
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
        </div>
        {nameFilter}
        <div className="collection-header__controls">
          <label htmlFor="collection-sort" className="visually-hidden">
            {t("collection.sortLabel")}
          </label>
          {sortSelect}
          <button
            type="button"
            aria-haspopup="dialog"
            aria-expanded={panelOpen}
            className={`filters-button ${activeCount > 0 ? "filters-button--active" : ""}`}
            onClick={() => setPanelOpen(true)}
          >
            <FiltersIcon width={16} height={16} />
            {activeCount > 0 ? t("collection.filtersButtonCount", { count: activeCount }) : t("collection.filtersButton")}
          </button>
        </div>
      </header>
      <div className="gallery-area">{gallery}</div>
      {panelOpen && (
        <FiltersSheet
          filters={filters}
          groups={groups}
          languages={languageOptions}
          count={rows.length}
          onChange={setFilters}
          onReset={resetFilters}
          onClose={() => setPanelOpen(false)}
        />
      )}
    </div>
  );
}

/** A card of the gallery: the card image in large format, badges on it, name and release below. */
function GalleryCard({
  row,
  name,
  languages,
  showSurplus,
  compactSurplus,
  imageWidth,
  linkLanguage,
}: {
  row: CollectionRow;
  name: string;
  languages: string[];
  showSurplus: boolean;
  compactSurplus: boolean;
  imageWidth: string;
  linkLanguage: string | null;
}) {
  const { services, index } = useApp();
  const { t, language: uiLanguage } = useI18n();
  const location = useLocation();
  const [failed, setFailed] = useState(false);
  const { variant } = row;
  const printing = row.owned[0]?.printing;
  const image = printing?.image && !failed ? printing.image : null;
  const setName = localize(index.sets.get(variant.release.setId)?.name ?? {}, uiLanguage);
  const release = releaseShortName(localize(variant.release.name, uiLanguage), setName);
  const url = (path: string) => new URL(path, services.imageBaseUrl).href;

  return (
    <Link
      to={`/cartes/${variant.card.slug}`}
      state={cardLinkState(location, variant.key, linkLanguage ?? printing?.language ?? null)}
      className="gallery-card"
      aria-label={t("collection.openCard", { name, release, number: variant.collectorNumber })}
    >
      <span className="gallery-card__frame">
        {image ? (
          <img
            src={url(image.thumbPath)}
            srcSet={`${url(image.thumbPath)} 256w, ${url(image.path)} ${image.width}w`}
            sizes={imageWidth}
            alt=""
            loading="lazy"
            decoding="async"
            onError={() => setFailed(true)}
          />
        ) : (
          <span className="gallery-card__placeholder">
            <span className="gallery-card__placeholder-stripe" style={{ background: cardColor(variant.card.color) }}>
              {localize(variant.card.baseName, uiLanguage) || name}
            </span>
            <span className="gallery-card__placeholder-art">
              <ImageIcon width={28} height={28} />
            </span>
            <span className="gallery-card__placeholder-line" />
            <span className="gallery-card__placeholder-line gallery-card__placeholder-line--short" />
          </span>
        )}
        <span className="gallery-card__rarity" style={{ background: rarityColor(variant.rarity) }}>
          {rarityShort(t, variant.rarity)}
        </span>
        {showSurplus && row.surplus > 0 && (
          <span className="gallery-card__surplus">{t(compactSurplus ? "collection.surplusShort" : "collection.surplus", { count: row.surplus })}</span>
        )}
        <span className="gallery-card__quantities">
          {languages
            .filter((code) => quantityIn(row, code) > 0)
            .map((code) => (
              <span key={code} className={`quantity-badge gallery-card__quantity quantity-badge--${code}`}>
                {t("collection.quantityBadge", { language: languageLabel(t, code), count: quantityIn(row, code) })}
              </span>
            ))}
        </span>
      </span>
      <span className="gallery-card__name">{name}</span>
      <span className="gallery-card__meta">{t("collection.meta", { release, number: variant.collectorNumber })}</span>
    </Link>
  );
}

/** Mobile: the filters in a bottom sheet, opened by the "Filtres" button. Changes apply at once. */
function FiltersSheet({
  filters,
  groups,
  languages,
  count,
  onChange,
  onReset,
  onClose,
}: {
  filters: CollectionFilters;
  groups: CollectionFilterGroup[];
  languages: (string | null)[];
  count: number;
  onChange: (changes: Partial<CollectionFilters>) => void;
  onReset: () => void;
  onClose: () => void;
}) {
  const { settings } = useApp();
  const { t } = useI18n();
  const sheet = useRef<HTMLElement>(null);

  useEffect(() => {
    sheet.current?.querySelector<HTMLElement>("button")?.focus();
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const toggle = (field: ListFilter, value: string) =>
    onChange({ [field]: filters[field].includes(value) ? filters[field].filter((v) => v !== value) : [...filters[field], value] });

  return (
    <div className="sheet-backdrop">
      <button type="button" className="sheet-backdrop__close" aria-label={t("collection.filtersClose")} onClick={onClose} />
      <section ref={sheet} role="dialog" aria-modal="true" aria-label={t("collection.filters")} className="filters-sheet">
        <span className="filters-sheet__handle" aria-hidden="true" />
        <div className="filters-sheet__group">
          <span className="filters-sheet__title">{t("collection.languages")}</span>
          <div role="group" aria-label={t("collection.languages")} className="chip-wrap">
            {languages.map((code) => (
              <button key={code ?? "all"} type="button" aria-pressed={filters.language === code} className="filter-pill" onClick={() => onChange({ language: code })}>
                {code ? languageLabel(t, code) : t("collection.allLanguagesShort")}
              </button>
            ))}
          </div>
        </div>
        <button type="button" role="switch" aria-checked={filters.duplicates} className="switch switch--large" onClick={() => onChange({ duplicates: !filters.duplicates })}>
          <span className="switch__track">
            <span className="switch__thumb" />
          </span>
          {t("collection.duplicatesOnly", { count: settings.duplicateThreshold })}
        </button>
        {groups.map((group) => (
          <div key={group.field} className="filters-sheet__group">
            <span className="filters-sheet__title">{t(group.title)}</span>
            <div role="group" aria-label={t(group.title)} className="chip-wrap">
              {group.options.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={filters[group.field].includes(option.value)}
                  className="filter-pill"
                  onClick={() => toggle(group.field, option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        ))}
        <div className="filters-sheet__actions">
          <button type="button" className="button button--secondary" onClick={onReset}>
            {t("collection.filtersReset")}
          </button>
          <button type="button" className="button button--primary" onClick={onClose}>
            {t("collection.showCards", { count })}
          </button>
        </div>
      </section>
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
    return [
      { field: "sets", title: "collection.filter.set", options: sets.map((set) => ({ value: set.id, label: localize(set.name, language) })) },
      { field: "releases", title: "collection.filter.release", options: [...releases].map(([value, label]) => ({ value, label })) },
      { field: "rarities", title: "collection.filter.rarity", options: [...rarities].map(([value, label]) => ({ value, label })) },
      {
        field: "types",
        title: "collection.filter.type",
        options: present(index.catalog.cards.map((card) => card.type)).map((value) => ({ value, label: cardTypeLabel(t, value) })),
      },
      {
        field: "colors",
        title: "collection.filter.color",
        options: present(index.catalog.cards.map((card) => card.color)).map((value) => ({ value, label: cardColorLabel(t, value) })),
      },
    ] satisfies CollectionFilterGroup[];
  }, [index, t, language, tabLabel]);
}
