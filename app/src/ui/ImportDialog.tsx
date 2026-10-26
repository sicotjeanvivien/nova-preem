import { useEffect, useRef, useState } from "react";
import type { CollectionFile, ImportMode } from "../domain/collectionFile.ts";
import { planImport } from "../domain/collectionFile.ts";
import { useI18n } from "../i18n/i18n.tsx";
import { useApp } from "./AppContext.tsx";
import { useCollection } from "./CollectionContext.tsx";

/**
 * Import of a backup (spec §4.3): choose Merge or Replace, see what will
 * change (added, changed, removed, unknown printings), then apply.
 */
export function ImportDialog({ file, onClose, onDone }: { file: CollectionFile; onClose: () => void; onDone: (count: number) => void }) {
  const { index } = useApp();
  const { entries, replaceAll } = useCollection();
  const { t, language } = useI18n();
  const [mode, setMode] = useState<ImportMode>("merge");
  const [busy, setBusy] = useState(false);
  const firstButton = useRef<HTMLInputElement>(null);

  useEffect(() => {
    firstButton.current?.focus();
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const plan = planImport([...entries.values()], file.entries, mode, (id) => index.printings.has(id));
  const date = new Intl.DateTimeFormat(language, { dateStyle: "long" }).format(new Date(file.exportedAt));
  const apply = async () => {
    setBusy(true);
    await replaceAll(plan.entries);
    onDone(plan.entries.length);
  };

  return (
    <div className="dialog-backdrop" onClick={(event) => event.target === event.currentTarget && onClose()}>
      <section role="dialog" aria-modal="true" aria-labelledby="import-title" className="dialog">
        <h2 id="import-title" className="dialog__title">
          {t("import.title")}
        </h2>
        <span className="dialog__meta">{t("import.fileInfo", { date, count: file.entries.length })}</span>
        <fieldset className="import-modes">
          <legend className="visually-hidden">{t("import.mode")}</legend>
          {(["merge", "replace"] as const).map((option, position) => (
            <label key={option} className={`import-mode ${mode === option ? "import-mode--selected" : ""}`}>
              <input ref={position === 0 ? firstButton : undefined} type="radio" name="import-mode" checked={mode === option} onChange={() => setMode(option)} />
              <span className="import-mode__text">
                <span className="import-mode__title">{t(option === "merge" ? "import.merge" : "import.replace")}</span>
                <span className="import-mode__hint">{t(option === "merge" ? "import.mergeHint" : "import.replaceHint")}</span>
              </span>
            </label>
          ))}
        </fieldset>
        <ul className="dialog__list" aria-live="polite">
          <li>{t("import.added", { count: plan.added })}</li>
          <li>{t("import.modified", { count: plan.modified })}</li>
          {mode === "replace" && <li>{t("import.removed", { count: plan.removed })}</li>}
          {plan.unknown > 0 && <li>{t("import.unknown", { count: plan.unknown })}</li>}
        </ul>
        <div className="dialog__actions">
          <button type="button" className="button button--secondary" onClick={onClose}>
            {t("import.cancel")}
          </button>
          <button type="button" className="button button--primary" disabled={busy} onClick={() => void apply()}>
            {t("import.confirm")}
          </button>
        </div>
      </section>
    </div>
  );
}
