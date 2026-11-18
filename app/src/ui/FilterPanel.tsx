import { useEffect, useRef } from "react";
import { useI18n } from "../i18n/i18n.tsx";
import { useIsDesktop } from "../platform/media.ts";
import { ChevronDownIcon, CloseIcon, FiltersIcon } from "./icons.tsx";

/*
 * The common filter panel (docs/app-spec.md §8.1), for the cards of a release,
 * Collection and Search, on desktop and mobile. A screen describes its criteria
 * once (a FilterModel) and places the three parts of the panel:
 * - FiltersButton, in its toolbar, with the number of active filters;
 * - FilterPanel: on desktop, a panel unfolded under the toolbar (the results move
 *   down, nothing is covered); on mobile, a sheet opened from the bottom;
 * - ActiveFilters: the active filters as removable chips, followed by "Tout effacer".
 * The state of the filters lives in the screen's URL; only the open state is local.
 */

export interface FilterOption {
  value: string;
  label: string;
  /** Results this option would give with the other filters (spec §5.1.1); 0 greys it out. */
  count?: number;
  /** Color dot before the label (rarity, card color). */
  dot?: string;
}

export type FilterCriterion =
  | {
      kind: "chips";
      id: string;
      title: string;
      options: FilterOption[];
      selected: readonly string[];
      onChange: (values: string[]) => void;
      /** One value at most, with a first chip for "all" (e.g. "Toutes" languages). */
      single?: { allLabel: string };
    }
  | { kind: "text"; id: string; title: string; value: string; placeholder?: string; onChange: (value: string) => void }
  | {
      kind: "switch" | "checkbox";
      id: string;
      label: string;
      /** Label of its chip when it is on. */
      activeLabel: string;
      checked: boolean;
      onChange: (checked: boolean) => void;
    };

export interface FilterModel {
  /** Accessible name of the panel. */
  label: string;
  criteria: FilterCriterion[];
  /** Results with the current filters ("Voir N cartes"). */
  resultCount: number;
  /** Clears every criterion of the panel (not what stays outside it, spec §8.1). */
  onReset: () => void;
  /** Note at the bottom of the panel. */
  note?: string;
}

export interface ActiveFilter {
  key: string;
  label: string;
  removeLabel: string;
  remove: () => void;
}

/** The active filters of a model, one per value (and one per text or switch in use). */
export function useActiveFilters(model: FilterModel): ActiveFilter[] {
  const { t } = useI18n();
  return model.criteria.flatMap((criterion): ActiveFilter[] => {
    switch (criterion.kind) {
      case "chips":
        return criterion.selected.map((value) => {
          const label = criterion.options.find((option) => option.value === value)?.label ?? value;
          return {
            key: `${criterion.id}:${value}`,
            label,
            removeLabel: t("filters.remove", { label: `${criterion.title} : ${label}` }),
            remove: () => criterion.onChange(criterion.selected.filter((v) => v !== value)),
          };
        });
      case "text": {
        const text = criterion.value.trim();
        return text ? [{ key: criterion.id, label: `« ${text} »`, removeLabel: t("filters.clearText", { title: criterion.title }), remove: () => criterion.onChange("") }] : [];
      }
      case "switch":
      case "checkbox":
        return criterion.checked
          ? [{ key: criterion.id, label: criterion.activeLabel, removeLabel: t("filters.remove", { label: criterion.activeLabel }), remove: () => criterion.onChange(false) }]
          : [];
    }
  });
}

/** The "Filtres" button: unfolds the panel on desktop, opens the sheet on mobile. */
export function FiltersButton({ model, open, onToggle, panelId }: { model: FilterModel; open: boolean; onToggle: () => void; panelId: string }) {
  const { t } = useI18n();
  const isDesktop = useIsDesktop();
  const count = useActiveFilters(model).length;
  return (
    <button
      type="button"
      className={`filters-button ${count > 0 ? "filters-button--active" : ""}`}
      {...(isDesktop ? { "aria-expanded": open, "aria-controls": panelId } : { "aria-haspopup": "dialog" as const, "aria-expanded": open })}
      onClick={onToggle}
    >
      <FiltersIcon width={16} height={16} />
      {t("filters.button")}
      {count > 0 && (
        <span className="filters-button__badge">
          <span className="visually-hidden">{" · "}</span>
          {count}
        </span>
      )}
      {isDesktop && <ChevronDownIcon width={14} height={14} className="filters-button__chevron" />}
    </button>
  );
}

/** The panel itself: under the toolbar on desktop, a bottom sheet on mobile. Rendered only when open. */
export function FilterPanel({ model, open, onClose, panelId }: { model: FilterModel; open: boolean; onClose: () => void; panelId: string }) {
  const { t } = useI18n();
  const isDesktop = useIsDesktop();
  const sheet = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!open) return;
    if (!isDesktop) sheet.current?.focus();
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, isDesktop, onClose]);

  if (!open) return null;
  const criteria = model.criteria.map((criterion) => <Criterion key={criterion.id} criterion={criterion} />);
  const reset = (
    <button type="button" className="button button--secondary" onClick={model.onReset}>
      {t("filters.reset")}
    </button>
  );
  const show = (
    <button type="button" className="button button--primary" onClick={onClose}>
      {t("filters.show", { count: model.resultCount })}
    </button>
  );

  if (isDesktop) {
    return (
      <section id={panelId} aria-label={model.label} className="filters-panel">
        <div className="filters-panel__criteria">{criteria}</div>
        <div className="filters-panel__footer">
          {model.note && <p className="filters-panel__note">{model.note}</p>}
          {reset}
          {show}
        </div>
      </section>
    );
  }
  return (
    <div className="sheet-backdrop">
      <button type="button" className="sheet-backdrop__close" aria-label={t("filters.close")} onClick={onClose} />
      <section ref={sheet} id={panelId} role="dialog" aria-modal="true" aria-label={model.label} tabIndex={-1} className="filters-sheet">
        <span className="filters-sheet__handle" aria-hidden="true" />
        {criteria}
        {model.note && <p className="filters-panel__note">{model.note}</p>}
        <div className="filters-sheet__actions">
          {reset}
          {show}
        </div>
      </section>
    </div>
  );
}

function Criterion({ criterion }: { criterion: FilterCriterion }) {
  switch (criterion.kind) {
    case "chips": {
      const { single } = criterion;
      const pick = (value: string) =>
        criterion.onChange(
          single ? [value] : criterion.selected.includes(value) ? criterion.selected.filter((v) => v !== value) : [...criterion.selected, value],
        );
      return (
        <div className="filters-panel__criterion">
          <span className="filters-panel__title" id={`filter-${criterion.id}`}>
            {criterion.title}
          </span>
          <div role="group" aria-labelledby={`filter-${criterion.id}`} className="chip-wrap">
            {single && (
              <button type="button" aria-pressed={criterion.selected.length === 0} className="filter-pill filter-chip" onClick={() => criterion.onChange([])}>
                {single.allLabel}
              </button>
            )}
            {criterion.options.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={criterion.selected.includes(option.value)}
                className={`filter-pill filter-chip ${option.count === 0 ? "filter-chip--empty" : ""}`}
                onClick={() => pick(option.value)}
              >
                {option.dot && <span className="filter-chip__dot" style={{ background: option.dot }} aria-hidden="true" />}
                {option.label}
                {option.count !== undefined && <span className="filter-chip__count">{option.count}</span>}
              </button>
            ))}
          </div>
        </div>
      );
    }
    case "text":
      return (
        <label className="filters-panel__criterion">
          <span className="filters-panel__title">{criterion.title}</span>
          <input
            type="search"
            className="filters-panel__text"
            value={criterion.value}
            placeholder={criterion.placeholder}
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => criterion.onChange(event.target.value)}
          />
        </label>
      );
    case "switch":
      return (
        <button type="button" role="switch" aria-checked={criterion.checked} className="switch switch--large" onClick={() => criterion.onChange(!criterion.checked)}>
          <span className="switch__track">
            <span className="switch__thumb" />
          </span>
          {criterion.label}
        </button>
      );
    case "checkbox":
      return (
        <label className="checkbox">
          <input type="checkbox" checked={criterion.checked} onChange={(event) => criterion.onChange(event.target.checked)} />
          {criterion.label}
        </label>
      );
  }
}

/** The active filters, as removable chips followed by "Tout effacer"; nothing when none is active. */
export function ActiveFilters({ model, summary, className = "" }: { model: FilterModel; summary?: string; className?: string }) {
  const { t } = useI18n();
  const active = useActiveFilters(model);
  if (active.length === 0) return null;
  return (
    <div className={`active-filters ${className}`}>
      {summary && <span className="active-filters__summary">{summary}</span>}
      {active.map((filter) => (
        <button key={filter.key} type="button" className="active-filter" aria-label={filter.removeLabel} onClick={filter.remove}>
          {filter.label}
          <CloseIcon width={12} height={12} />
        </button>
      ))}
      <button type="button" className="active-filters__clear" onClick={model.onReset}>
        {t("filters.clearAll")}
      </button>
    </div>
  );
}
