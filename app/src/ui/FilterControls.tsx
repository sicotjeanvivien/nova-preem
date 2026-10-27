import { useState } from "react";
import { useI18n } from "../i18n/i18n.tsx";
import type { MessageKey } from "../i18n/messages.ts";
import { ChevronDownIcon } from "./icons.tsx";

/** A multiple-choice filter (set, rarity, color…), shared by Collection and Search. */
export interface FilterGroup<Field extends string = string> {
  field: Field;
  title: MessageKey;
  options: { value: string; label: string }[];
}

export function CheckboxList({ group, selected, onChange }: { group: FilterGroup; selected: readonly string[]; onChange: (values: string[]) => void }) {
  return (
    <>
      {group.options.map((option) => (
        <label key={option.value} className="checkbox">
          <input
            type="checkbox"
            checked={selected.includes(option.value)}
            onChange={(event) => onChange(event.target.checked ? [...selected, option.value] : selected.filter((value) => value !== option.value))}
          />
          {option.label}
        </label>
      ))}
    </>
  );
}

/** Desktop: one fieldset of checkboxes per filter, in the filter column. */
export function FilterFieldsets<Field extends string>({
  groups,
  selected,
  onChange,
}: {
  groups: FilterGroup<Field>[];
  selected: (field: Field) => readonly string[];
  onChange: (field: Field, values: string[]) => void;
}) {
  const { t } = useI18n();
  return (
    <>
      {groups.map((group) => (
        <fieldset key={group.field} className="filter-group">
          <legend>{t(group.title)}</legend>
          <CheckboxList group={group} selected={selected(group.field)} onChange={(values) => onChange(group.field, values)} />
        </fieldset>
      ))}
    </>
  );
}

/** Mobile: one button per filter; the open one shows its options below the row. */
export function FilterMenus<Field extends string>({
  groups,
  selected,
  onChange,
  panelId,
}: {
  groups: FilterGroup<Field>[];
  selected: (field: Field) => readonly string[];
  onChange: (field: Field, values: string[]) => void;
  panelId: string;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState<Field | null>(null);
  const openGroup = groups.find((group) => group.field === open);
  return (
    <>
      <div className="chip-row">
        {groups.map((group) => {
          const count = selected(group.field).length;
          return (
            <button
              key={group.field}
              type="button"
              aria-expanded={open === group.field}
              aria-controls={panelId}
              className={`menu-button ${count > 0 ? "menu-button--active" : ""}`}
              onClick={() => setOpen(open === group.field ? null : group.field)}
            >
              {count > 0 ? t("collection.filter.count", { label: t(group.title), count }) : t(group.title)}
              <ChevronDownIcon width={14} height={14} />
            </button>
          );
        })}
      </div>
      {openGroup && (
        <div id={panelId} role="group" aria-label={t(openGroup.title)} className="menu-panel">
          <CheckboxList group={openGroup} selected={selected(openGroup.field)} onChange={(values) => onChange(openGroup.field, values)} />
          {selected(openGroup.field).length > 0 && (
            <button type="button" className="secondary-button menu-panel__clear" onClick={() => onChange(openGroup.field, [])}>
              {t("collection.filter.clear")}
            </button>
          )}
        </div>
      )}
    </>
  );
}
