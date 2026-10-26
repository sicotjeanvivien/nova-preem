import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Link, Navigate, useLocation, useNavigate, useParams, useSearchParams } from "react-router";
import { localize } from "../../domain/catalog.ts";
import { percentFloor, releaseVariants } from "../../domain/completion.ts";
import { formatMissingList } from "../../domain/missingList.ts";
import { computeSetView, FILTER_PARAMS } from "../../domain/setView.ts";
import { releaseShortName, tabParam, type SetTab, type TabSelection } from "../../domain/setTabs.ts";
import { ownedInOtherLanguages, type GridFilter, type Variant } from "../../domain/variants.ts";
import { useI18n } from "../../i18n/i18n.tsx";
import type { MessageKey } from "../../i18n/messages.ts";
import { useApp } from "../AppContext.tsx";
import { cardLinkState } from "../cardLink.ts";
import { useCollection, type QuantityChange } from "../CollectionContext.tsx";
import { ChevronLeftIcon } from "../icons.tsx";
import { languageLabel, rarityShort } from "../labels.ts";
import { ProgressBar } from "../ProgressBar.tsx";
import { SetTile } from "../SetTile.tsx";
import { Toast } from "../Toast.tsx";
import { useDocumentTitle } from "./useDocumentTitle.ts";
import { useTabLabel } from "./useTabLabel.ts";

const FILTERS: { id: GridFilter; label: MessageKey }[] = [
  { id: "all", label: "filter.all" },
  { id: "missing", label: "filter.missing" },
  { id: "owned", label: "filter.owned" },
  { id: "duplicates", label: "filter.duplicates" },
];

const TOAST_DURATION_MS = 5000;

type ToastState = { id: number; text: string; change: QuantityChange | null };

/**
 * Sets, level 2 (SetGrid / WebSets): the cards of a set in five fixed tabs,
 * and quick entry: one tap adds one copy (docs/app-spec.md §2.1, §5.1, §5.4).
 * The tab, the sub-filter, the filter and the language live in the URL.
 */
export function SetPage() {
  const { setId = "" } = useParams();
  const { index, settings } = useApp();
  const { quantities, change, undo } = useCollection();
  const { t, language: uiLanguage } = useI18n();
  const tabLabel = useTabLabel();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();

  const view = useMemo(
    () =>
      computeSetView(index, setId, { tirage: params.get("tirage"), filtre: params.get("filtre"), langue: params.get("langue") }, settings, quantities),
    [index, setId, params, settings, quantities],
  );
  const set = view?.set;
  const setName = set ? localize(set.name, uiLanguage) : "";
  useDocumentTitle(setName);

  const [removeMode, setRemoveMode] = useState(false);
  const [lastTapped, setLastTapped] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const toastId = useRef(0);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), TOAST_DURATION_MS);
    return () => clearTimeout(timer);
  }, [toast]);

  const updateParams = useCallback(
    (changes: Record<string, string | null>) => {
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
      );
    },
    [setParams],
  );

  if (!view || !set) return <Navigate to="/sets" replace />;

  const { tabs, selection, languages, language, filter, visible } = view;
  const nameLanguage = settings.cardNameLanguage === "entry" ? language : settings.cardNameLanguage;
  const progress = releaseVariants(index, selection.releases.map((r) => r.id), quantities);
  const multipleReleases = selection.releases.length > 1;
  const selectionLabel = selection.release ? releaseShortName(localize(selection.release.name, uiLanguage), setName) : tabLabel(selection.tab, setName);
  const cardName = (variant: Variant) => localize(variant.card.name, nameLanguage);

  const showToast = (text: string, quantityChange: QuantityChange | null) => setToast({ id: ++toastId.current, text, change: quantityChange });

  const tap = (variant: Variant) => {
    const printing = variant.printings.get(language);
    if (!printing) {
      // Not printed in this language: nothing is added, the card page shows what exists (spec §5.1).
      navigate(`/cartes/${variant.card.slug}`, { state: cardLinkState(location, variant.key, language) });
      return;
    }
    setLastTapped(variant.key);
    const result = change(printing.id, removeMode ? -1 : 1);
    if (!result) return;
    const message = removeMode ? "setPage.removed" : "setPage.added";
    showToast(t(message, { name: cardName(variant), language: languageLabel(t, language) }), result);
  };

  const undoLast = () => {
    if (toast?.change) undo(toast.change);
    setToast(null);
  };

  const copyMissing = async () => {
    const text = formatMissingList(
      t("setPage.missingTitle", { set: setName, release: selectionLabel, language: languageLabel(t, language) }),
      visible.map((variant) => {
        const others = ownedInOtherLanguages(variant, quantities, language).map((code) => t("tile.ownedIn", { language: languageLabel(t, code) }));
        const notes = [...(multipleReleases ? [releaseShortName(localize(variant.release.name, uiLanguage), setName)] : []), ...others];
        return {
          number: variant.collectorNumber,
          name: cardName(variant),
          rarity: rarityShort(t, variant.rarity),
          ...(notes.length > 0 && { note: notes.join(" · ") }),
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

  const selectTabAt = (tab: SetTab) => updateParams({ tirage: tabParam({ tab, release: null }), langue: null });

  const onTabKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const current = tabs.indexOf(selection.tab);
    const delta = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (!delta) return;
    event.preventDefault();
    const next = tabs[(current + delta + tabs.length) % tabs.length]!;
    selectTabAt(next);
    document.getElementById(`tab-${next.id}`)?.focus();
  };

  return (
    <div className="set-page">
      <div className="set-page__top">
        <header className="set-header">
          <Link to="/sets" className="icon-button mobile-only" aria-label={t("setPage.back")}>
            <ChevronLeftIcon width={22} height={22} />
          </Link>
          <div className="set-header__titles">
            <span className="set-header__eyebrow">
              <Link to="/sets" className="desktop-only set-header__crumb">
                {t("sets.title")}
              </Link>
              <span className="desktop-only"> / </span>
              {t("sets.eyebrow", { order: set.order })}
            </span>
            <h1 className="set-header__name">{setName}</h1>
          </div>
          <div className="set-header__progress">
            <ProgressBar progress={progress} color="var(--color-accent)" className="set-header__bar desktop-only" label={t("setPage.variantsOwned")} />
            <div className="set-header__count">
              {t("sets.ratio", progress)}
              <span className="desktop-only"> · {percentFloor(progress)}&nbsp;%</span>
            </div>
            <div className="set-header__caption mobile-only">{t("setPage.variantsOwned")}</div>
          </div>
        </header>

        <div role="tablist" aria-label={t("setPage.tabs")} className="tabs" onKeyDown={onTabKeyDown}>
          {tabs.map((tab) => {
            const selected = tab === selection.tab;
            const count = releaseVariants(index, tab.releases.map((r) => r.id), quantities);
            return (
              <button
                key={tab.id}
                id={`tab-${tab.id}`}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-controls="set-grid"
                tabIndex={selected ? 0 : -1}
                className="tab"
                onClick={() => selectTabAt(tab)}
              >
                {tabLabel(tab, setName)} <span className="tab__count">{t("sets.ratio", count).replace(/ /g, "")}</span>
              </button>
            );
          })}
        </div>

        {selection.tab.kind === "group" && <SubFilter selection={selection} setName={setName} onSelect={(tirage) => updateParams({ tirage, langue: null })} />}

        <div className="toolbar">
          <div className="toolbar__entry">
            <span className="toolbar__hint">
              <span className="mobile-only">{t("setPage.tapAdds")}</span>
              <span className="desktop-only">{t("setPage.clickAdds")}</span>
            </span>
            {languages.length > 1 ? (
              <div role="group" aria-label={t("setPage.entryLanguage")} className="segmented">
                {languages.map((code) => (
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
            ) : (
              <span className={`only-language only-language--${language}`}>{t("setPage.onlyLanguage", { language: languageLabel(t, language) })}</span>
            )}
            <button type="button" aria-pressed={removeMode} className={`mode-button ${removeMode ? "mode-button--remove" : ""}`} onClick={() => setRemoveMode(!removeMode)}>
              {t(removeMode ? "setPage.modeRemove" : "setPage.modeAdd")}
            </button>
          </div>
          <div role="group" aria-label={t("setPage.filters")} className="toolbar__filters">
            {FILTERS.map((f) => (
              <button key={f.id} type="button" aria-pressed={f.id === filter} className="filter-pill" onClick={() => updateParams({ filtre: FILTER_PARAMS[f.id] })}>
                {t(f.label)}
              </button>
            ))}
          </div>
          {filter === "missing" && (
            <div className="toolbar__missing">
              <span className="toolbar__missing-count mobile-only">{t("setPage.missingCount", { count: visible.length })}</span>
              <button type="button" className="secondary-button" onClick={() => void copyMissing()} disabled={visible.length === 0}>
                <span className="mobile-only">{t("setPage.copyList")}</span>
                <span className="desktop-only">{t("setPage.copyMissing", { count: visible.length })}</span>
              </button>
            </div>
          )}
        </div>
      </div>

      <div id="set-grid" role="tabpanel" aria-labelledby={`tab-${selection.tab.id}`} className="tile-grid">
        {visible.map((variant) => (
          <SetTile
            key={variant.key}
            variant={variant}
            language={language}
            name={cardName(variant)}
            releaseName={multipleReleases ? releaseShortName(localize(variant.release.name, uiLanguage), setName) : null}
            quantities={quantities}
            removeMode={removeMode}
            highlighted={variant.key === lastTapped}
            onTap={() => tap(variant)}
          />
        ))}
      </div>
      {visible.length === 0 && <p className="set-page__empty">{t("setPage.empty")}</p>}

      {toast && <Toast key={toast.id} text={toast.text} {...(toast.change && { onUndo: undoLast })} />}
    </div>
  );
}

function SubFilter({ selection, setName, onSelect }: { selection: TabSelection; setName: string; onSelect: (tirage: string) => void }) {
  const { t, language } = useI18n();
  const options = [
    { id: selection.tab.id, label: t(`subfilter.all.${selection.tab.group}` as MessageKey), pressed: selection.release === null },
    ...selection.tab.releases.map((release) => ({
      id: release.id,
      label: releaseShortName(localize(release.name, language), setName),
      pressed: selection.release?.id === release.id,
    })),
  ];
  return (
    <div role="group" aria-label={t("setPage.subfilter")} className="subfilter">
      {options.map((option) => (
        <button key={option.id} type="button" aria-pressed={option.pressed} className="subfilter__option" onClick={() => onSelect(option.id)}>
          {option.label}
        </button>
      ))}
    </div>
  );
}
