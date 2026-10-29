import { useEffect, useRef, useState } from "react";
import { fileSettingsSchema } from "../domain/collectionFile.ts";
import { planFirstSync, type FirstSyncChoice, type SideChanges } from "../domain/sync.ts";
import { useI18n } from "../i18n/i18n.tsx";
import { useIsDesktop } from "../platform/media.ts";
import { useApp } from "./AppContext.tsx";
import { useCollection } from "./CollectionContext.tsx";
import { useSync } from "./SyncContext.tsx";

const CHOICES: FirstSyncChoice[] = ["merge", "keep-remote", "keep-local"];

/**
 * First sync with a collection on both sides (sync spec §3.3, SyncFirst /
 * WebSyncFirst): the two collections, the three choices and what each one
 * changes on each side. Cancel: sync is not turned on.
 */
export function SyncFirstDialog() {
  const { question, answer, cancelFirstSync } = useSync();
  const { index, settings } = useApp();
  const { entries } = useCollection();
  const { t, language } = useI18n();
  const isDesktop = useIsDesktop();
  const [choice, setChoice] = useState<FirstSyncChoice>("merge");
  const [busy, setBusy] = useState(false);
  const firstOption = useRef<HTMLInputElement>(null);
  const variant = isDesktop ? "browser" : "device";

  useEffect(() => {
    if (!question) return;
    setChoice("merge");
    setBusy(false);
    firstOption.current?.focus();
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && void cancelFirstSync();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [question, cancelFirstSync]);

  if (!question) return null;
  const local = { entries: [...entries.values()], settings: fileSettingsSchema.parse(settings) };
  const plan = planFirstSync(choice, local, question.remote, (id) => index.printings.has(id));
  const fileDate = new Intl.DateTimeFormat(language, { dateStyle: "long" }).format(new Date(question.remoteDate));
  const oldest = local.entries.reduce<string | null>((min, entry) => (min === null || entry.firstAddedAt < min ? entry.firstAddedAt : min), null);
  const days = oldest ? Math.floor((Date.now() - new Date(oldest).getTime()) / 86_400_000) : 0;

  const options: Record<FirstSyncChoice, { title: string; hint: string; confirm: string }> = {
    merge: { title: t("syncFirst.merge"), hint: t("syncFirst.mergeHint"), confirm: t("syncFirst.confirm.merge") },
    "keep-remote": { title: t("syncFirst.keepRemote"), hint: t(`syncFirst.keepRemoteHint.${variant}`), confirm: t(`syncFirst.confirm.keepRemote.${variant}`) },
    "keep-local": { title: t(`syncFirst.keepLocal.${variant}`), hint: t(`syncFirst.keepLocalHint.${variant}`), confirm: t("syncFirst.confirm.keepLocal") },
  };
  // Only the sides the choice touches (SyncFirst summary).
  const sides: { where: string; changes: SideChanges }[] = [
    ...(choice !== "keep-local" ? [{ where: t(`syncFirst.onLocal.${variant}`), changes: plan.device }] : []),
    ...(choice !== "keep-remote" ? [{ where: t("syncFirst.inDrive"), changes: plan.drive }] : []),
  ];
  const confirm = async () => {
    setBusy(true);
    await answer(choice);
  };

  const summary = (
    <div aria-live="polite" className="sync-first__summary">
      {isDesktop && <span className="sync-first__summary-title">{t("syncFirst.changes")}</span>}
      {sides.map(({ where, changes }) => (
        <div key={where} className="sync-first__side">
          <span className="sync-first__where">{where}</span>
          <ul className="sync-first__lines">
            <li>{t("import.added", { count: changes.added })}</li>
            <li>{t("import.modified", { count: changes.modified })}</li>
            {choice !== "merge" && <li className="sync-first__loss">{t("import.removed", { count: changes.removed })}</li>}
          </ul>
        </div>
      ))}
      {plan.unknown > 0 && <span className="sync-first__note">{t("syncFirst.unknown", { count: plan.unknown })}</span>}
    </div>
  );

  return (
    <div className="dialog-backdrop">
      <section role="dialog" aria-modal="true" aria-labelledby="sync-first-title" className="dialog sync-first">
        <div className="sync-first__heading">
          <h2 id="sync-first-title" className="dialog__title">
            {t("syncFirst.title")}
          </h2>
          <span className="sync-first__subtitle">{t("syncFirst.subtitle")}</span>
        </div>

        <div className="sync-first__collections">
          <div className="sync-first__collection">
            <span className="sync-first__label">{t("syncFirst.drive")}</span>
            <span className="sync-first__count">{t("syncFirst.printings", { count: question.remote.entries.length })}</span>
            <span className="sync-first__date">{t("syncFirst.fileDate", { date: fileDate })}</span>
          </div>
          <div className="sync-first__collection">
            <span className="sync-first__label">{t(`syncFirst.local.${variant}`)}</span>
            <span className="sync-first__count">{t("syncFirst.printings", { count: local.entries.length })}</span>
            <span className="sync-first__date">{days > 0 ? t("syncFirst.enteredSince", { count: days }) : t("syncFirst.enteredToday")}</span>
          </div>
        </div>

        <div className="sync-first__body">
          <fieldset className="import-modes">
            <legend className="visually-hidden">{t("syncFirst.legend")}</legend>
            {CHOICES.map((option, position) => (
              <label key={option} className={`import-mode sync-first__option ${choice === option ? "import-mode--selected" : ""}`}>
                <input
                  ref={position === 0 ? firstOption : undefined}
                  type="radio"
                  name="first-sync"
                  checked={choice === option}
                  onChange={() => setChoice(option)}
                />
                <span className="import-mode__text">
                  <span className="import-mode__title">{options[option].title}</span>
                  <span className="import-mode__hint">{options[option].hint}</span>
                </span>
              </label>
            ))}
          </fieldset>
          {summary}
        </div>

        <div className="sync-first__footer">
          {isDesktop && <span className="sync-first__note">{t("syncFirst.cancelNote")}</span>}
          <div className="dialog__actions">
            <button type="button" className="button button--secondary" disabled={busy} onClick={() => void cancelFirstSync()}>
              {t("sync.cancel")}
            </button>
            <button type="button" className={`button ${choice === "merge" ? "button--primary" : "button--danger"}`} disabled={busy} onClick={() => void confirm()}>
              {options[choice].confirm}
            </button>
          </div>
          {!isDesktop && <span className="sync-first__note sync-first__note--center">{t("syncFirst.cancelNote")}</span>}
        </div>
      </section>
    </div>
  );
}
