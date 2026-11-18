import { useCallback, useMemo, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router";
import { localize } from "../../domain/catalog.ts";
import { releasesOfSet } from "../../domain/catalogIndex.ts";
import {
  COLLECTION_SORTS,
  collectionParams,
  collectionRows,
  type CollectionFilters,
  type CollectionRow,
  type CollectionSort,
  NO_FILTERS,
  parseCollectionParams,
  quantityIn,
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
import { ActiveFilters, type FilterCriterion, FilterPanel, FiltersButton, type FilterModel, type FilterOption } from "../FilterPanel.tsx";
import { colorOptions, rarityOptions, typeOptions } from "../filterOptions.ts";
import { ImageIcon } from "../icons.tsx";
import { cardColor, languageLabel, rarityColor, rarityShort } from "../labels.ts";
import { HeaderIndicators } from "../SyncIndicators.tsx";
import { useDocumentTitle } from "./useDocumentTitle.ts";
import { useTabLabel } from "./useTabLabel.ts";

type ListFilter = "sets" | "releases" | "rarities" | "types" | "colors";

const SIZE = { min: 140, max: 280, step: 20 };
const PANEL_ID = "collection-filters";

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
  const closePanel = useCallback(() => setPanelOpen(false), []);
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

  const listOptions = useListOptions();
  const filterModel: FilterModel = {
    label: t("collection.filters"),
    resultCount: rows.length,
    onReset: resetFilters,
    criteria: [
      {
        kind: "chips",
        id: "language",
        title: t("collection.languages"),
        single: { allLabel: t("collection.allLanguagesShort") },
        options: displayLanguages.map((code) => ({
          value: code,
          label: languageLabel(t, code),
          activeLabel: t("collection.languageOnly", { language: languageLabel(t, code) }),
        })),
        selected: filters.language ? [filters.language] : [],
        onChange: ([language]) => setFilters({ language: language ?? null }),
      },
      {
        kind: "switch",
        id: "duplicates",
        title: t("collection.duplicates"),
        label: t("collection.duplicatesSwitch", { count: settings.duplicateThreshold }),
        activeLabel: t("collection.duplicates"),
        checked: filters.duplicates,
        onChange: (duplicates) => setFilters({ duplicates }),
      },
      ...listOptions.map(
        ({ field, title, options }): FilterCriterion => ({
          kind: "chips",
          id: field,
          title: t(title),
          options,
          selected: filters[field],
          onChange: (values) => setFilters({ [field]: values }),
        }),
      ),
    ],
  };
  const filtersButton = <FiltersButton model={filterModel} open={panelOpen} onToggle={() => setPanelOpen((open) => !open)} panelId={PANEL_ID} />;
  const filterPanel = <FilterPanel model={filterModel} open={panelOpen} onClose={closePanel} panelId={PANEL_ID} />;

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
          {filtersButton}
          <span className="collection-header__summary">{t("collection.summaryLong", summary)}</span>
        </header>
        {filterPanel}
        <div className="collection-body">
          <div className="gallery-area">
            <ActiveFilters model={filterModel} className="active-filters--gallery" />
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
          <span className="collection-header__end">
            <span className="collection-header__summary">{t("collection.summary", summary)}</span>
            <HeaderIndicators />
          </span>
        </div>
        {nameFilter}
        <div className="collection-header__controls">
          <label htmlFor="collection-sort" className="visually-hidden">
            {t("collection.sortLabel")}
          </label>
          {sortSelect}
          {filtersButton}
        </div>
        <ActiveFilters model={filterModel} className="active-filters--toolbar" />
      </header>
      <div className="gallery-area">{gallery}</div>
      {filterPanel}
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
            crossOrigin="anonymous"
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

/** Options of the list filters, from the catalog (spec §5.7: set, release, rarity, type, color). */
function useListOptions(): { field: ListFilter; title: MessageKey; options: FilterOption[] }[] {
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
    return [
      { field: "sets" as const, title: "collection.filter.set" as const, options: sets.map((set) => ({ value: set.id, label: localize(set.name, language) })) },
      { field: "releases" as const, title: "collection.filter.release" as const, options: [...releases].map(([value, label]) => ({ value, label })) },
      { field: "rarities" as const, title: "collection.filter.rarity" as const, options: rarityOptions(index, t, language) },
      { field: "types" as const, title: "collection.filter.type" as const, options: typeOptions(index, t) },
      { field: "colors" as const, title: "collection.filter.color" as const, options: colorOptions(index, t) },
    ];
  }, [index, t, language, tabLabel]);
}
