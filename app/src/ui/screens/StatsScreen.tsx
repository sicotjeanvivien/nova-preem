import type { ReactNode } from "react";
import { Link, useSearchParams } from "react-router";
import { localize } from "../../domain/catalog.ts";
import { releasesOfSet } from "../../domain/catalogIndex.ts";
import {
  masterBreakdown,
  masterSet,
  percentFloor,
  playableByType,
  playableSet,
  type Progress,
  releaseByRarity,
  releaseInLanguage,
  releaseVariants,
} from "../../domain/completion.ts";
import { releaseShortName } from "../../domain/setTabs.ts";
import { summarizeSets } from "../../domain/sets.ts";
import { useI18n } from "../../i18n/i18n.tsx";
import type { MessageKey } from "../../i18n/messages.ts";
import { useIsDesktop } from "../../platform/media.ts";
import { useApp } from "../AppContext.tsx";
import { useCollection } from "../CollectionContext.tsx";
import { cardTypeLabel, languageLabel, rarityColor } from "../labels.ts";
import { ProgressBar } from "../ProgressBar.tsx";
import { useDocumentTitle } from "./useDocumentTitle.ts";

type Mode = "playable" | "master" | "release";
const MODE_PARAMS: Record<Mode, string> = { playable: "jouable", master: "master", release: "tirage" };
const TYPE_COLORS: Record<string, string> = {
  legend: "var(--color-card-red)",
  unit: "var(--color-vo)",
  gear: "var(--color-rarity-epic)",
  program: "var(--color-rarity-uncommon)",
};

interface BreakdownRow {
  key: string;
  label: string;
  progress: Progress;
  color: string;
  muted?: boolean;
}

/**
 * Stats (Completion / WebStats, docs/app-spec.md §5.3): the four completion
 * measures and their breakdowns. Mobile shows one measure at a time; desktop a
 * dashboard. The release of "par tirage" can be chosen (spec: "le tirage choisi").
 */
export function StatsScreen() {
  const { index, settings } = useApp();
  const { quantities } = useCollection();
  const { t, language: uiLanguage } = useI18n();
  const isDesktop = useIsDesktop();
  const [params, setParams] = useSearchParams();
  useDocumentTitle(t("stats.title"));

  const sets = summarizeSets(index.catalog).map((summary) => summary.set);
  const set = sets.find((s) => s.id === params.get("set")) ?? sets[0];
  if (!set) return null;
  const setName = localize(set.name, uiLanguage);
  const releases = releasesOfSet(index, set.id).filter((release) => index.printingsByRelease.has(release.id));
  const release =
    releases.find((r) => r.id === params.get("tirage")) ?? releases.find((r) => r.id === settings.entryReleaseId) ?? releases[0]!;
  const releaseName = releaseShortName(localize(release.name, uiLanguage), setName);
  const mode = (Object.keys(MODE_PARAMS) as Mode[]).find((m) => MODE_PARAMS[m] === params.get("mode")) ?? "release";
  // "Toutes", then the languages of the chosen release (a language absent from it is not offered, §5.3).
  const releaseLanguages = [...release.languages].sort((a, b) => (a === settings.entryLanguage ? -1 : b === settings.entryLanguage ? 1 : 0));
  const requested = params.get("langue");
  const scope = requested && releaseLanguages.includes(requested) ? requested : null;
  const update = (changes: Record<string, string | null>) =>
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

  const groups = settings.completionGroups;
  const playable = playableSet(index, set.id, groups, quantities);
  const master = masterSet(index, set.id, groups, quantities);
  const releaseProgress = scope ? releaseInLanguage(index, release.id, scope, quantities)! : releaseVariants(index, [release.id], quantities);
  const groupNames = groups.map((group) => t(`group.${group}` as MessageKey)).join(" + ");

  const typeRows: BreakdownRow[] = [...playableByType(index, set.id, groups, quantities)]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([type, progress]) => ({ key: type, label: cardTypeLabel(t, type), progress, color: isDesktop ? "var(--color-accent)" : (TYPE_COLORS[type] ?? "var(--color-accent)") }));
  const masterRows: BreakdownRow[] = masterBreakdown(index, set.id, groups, quantities, releaseLanguages.length > 0 ? releaseLanguages : index.catalog.languages).map((row) => {
    const mainRelease = row.releaseId ? index.releases.get(row.releaseId) : undefined;
    return {
      key: `${row.releaseId ?? row.group}-${row.language ?? ""}`,
      label: mainRelease
        ? t("stats.mainRow", { release: releaseShortName(localize(mainRelease.name, uiLanguage), setName), language: languageLabel(t, row.language ?? "") })
        : t(`group.${row.group}` as MessageKey),
      progress: row.progress,
      color: !row.counted ? "var(--color-border-dashed)" : row.language === "fr" ? "var(--color-vf)" : row.language ? "var(--color-vo)" : "var(--color-accent)",
      muted: !row.counted,
    };
  });
  const rarityRows: BreakdownRow[] = releaseByRarity(index, release.id, scope, quantities).map((row) => {
    const rarity = index.rarities.get(row.rarityIds[0] ?? "");
    return {
      key: row.key,
      label: row.key === "iconic" ? t("collection.iconic") : rarity ? localize(rarity.name, uiLanguage) : row.key,
      progress: row.progress,
      color: rarityColor(rarity),
    };
  });

  const releaseSelect = (
    <label className="stats-select">
      <span>{t("stats.releaseChoice")}</span>
      <select value={release.id} onChange={(event) => update({ tirage: event.target.value, langue: null })}>
        {releases.map((r) => (
          <option key={r.id} value={r.id}>
            {releaseShortName(localize(r.name, uiLanguage), setName)}
          </option>
        ))}
      </select>
    </label>
  );
  const setSelect =
    sets.length > 1 ? (
      <label className="stats-select">
        <span>{t("stats.setChoice")}</span>
        <select value={set.id} onChange={(event) => update({ set: event.target.value, tirage: null, langue: null })}>
          {sets.map((s) => (
            <option key={s.id} value={s.id}>
              {localize(s.name, uiLanguage)}
            </option>
          ))}
        </select>
      </label>
    ) : null;
  const languageChips = releaseLanguages.length > 1 && (
    <div role="group" aria-label={t("stats.languageScope")} className="stats-chips">
      {[null, ...releaseLanguages].map((code) => (
        <button key={code ?? "all"} type="button" aria-pressed={scope === code} className="filter-pill" onClick={() => update({ langue: code })}>
          {code ? languageLabel(t, code) : t("stats.allLanguages")}
        </button>
      ))}
    </div>
  );

  if (isDesktop) {
    const kpis = [
      { key: "playable", label: t("stats.mode.playable"), progress: playable, detail: t("stats.cards", playable), color: "var(--color-accent)" },
      { key: "master", label: t("stats.mode.master"), progress: master, detail: t("stats.printings", master), color: "var(--color-rarity-epic)" },
      ...releaseLanguages.map((code) => {
        const progress = releaseInLanguage(index, release.id, code, quantities)!;
        return {
          key: code,
          label: t("stats.kpi.inLanguage", { release: releaseName, language: languageLabel(t, code) }),
          progress,
          detail: t("stats.printings", progress),
          color: code === "fr" ? "var(--color-vf)" : "var(--color-vo)",
        };
      }),
    ];
    return (
      <div className="stats stats--desktop">
        <header className="stats-header">
          <div className="stats-header__titles">
            <span className="stats-header__set">{setName}</span>
            <h1>{t("stats.title")}</h1>
          </div>
          {setSelect}
          <CountedLink label={t("stats.counted", { groups: groupNames })} />
        </header>
        <div className="kpi-grid">
          {kpis.map((kpi) => (
            <section key={kpi.key} className="kpi">
              <span className="kpi__label">{kpi.label}</span>
              <span className="kpi__value" style={{ color: kpi.color }}>
                {percentFloor(kpi.progress)}&nbsp;%
              </span>
              <span className="kpi__detail">{kpi.detail}</span>
              <ProgressBar progress={kpi.progress} color={kpi.color} label={kpi.label} />
            </section>
          ))}
        </div>
        <div className="breakdown-grid">
          <Breakdown title={t("stats.byReleaseLanguage")} rows={masterRows} note={t("stats.notCountedNote")} />
          <Breakdown
            title={t("stats.byRarityOf", { release: releaseName })}
            rows={rarityRows}
            controls={
              <>
                {releaseSelect}
                {languageChips}
              </>
            }
          />
          <Breakdown title={t("stats.byTypeDesktop")} rows={typeRows} note={t("stats.playableNote")} />
        </div>
      </div>
    );
  }

  const headline =
    mode === "playable"
      ? { label: t("stats.mode.playable"), progress: playable, explain: t("stats.playable.explain") }
      : mode === "master"
        ? { label: t("stats.mode.master"), progress: master, explain: t("stats.master.explain") }
        : {
            label: scope ? t("stats.release.language", { release: releaseName, language: languageLabel(t, scope) }) : t("stats.release.all", { release: releaseName }),
            progress: releaseProgress,
            explain: t(scope ? "stats.release.languageExplain" : "stats.release.allExplain"),
          };
  const breakdown =
    mode === "playable"
      ? { title: t("stats.byType"), rows: typeRows }
      : mode === "master"
        ? { title: t("stats.byReleaseLanguage"), rows: masterRows, note: t("stats.notCountedNote") }
        : { title: t("stats.byRarity"), rows: rarityRows };

  return (
    <div className="stats">
      <header className="topbar">
        <h1>{t("stats.title")}</h1>
        <span className="topbar__aside">{setName}</span>
      </header>
      <div className="screen stats-body">
        {setSelect}
        <div role="group" aria-label={t("stats.modes")} className="mode-switch">
          {(Object.keys(MODE_PARAMS) as Mode[]).map((m) => (
            <button key={m} type="button" aria-pressed={m === mode} className="mode-switch__option" onClick={() => update({ mode: MODE_PARAMS[m] })}>
              {t(`stats.mode.${m}` as MessageKey)}
            </button>
          ))}
        </div>
        {mode === "release" && releaseSelect}
        <section className="headline">
          <span className="headline__label">{headline.label}</span>
          <div className="headline__figures">
            <span className="headline__percent">{percentFloor(headline.progress)}&nbsp;%</span>
            <span className="headline__ratio">{t("sets.ratio", headline.progress)}</span>
          </div>
          <ProgressBar progress={headline.progress} color="var(--color-accent)" className="headline__bar" label={headline.label} />
          <p className="headline__explain">{headline.explain}</p>
        </section>
        {mode === "release" && languageChips}
        <Breakdown title={breakdown.title} rows={breakdown.rows} plain {...("note" in breakdown && { note: breakdown.note })} />
        <Link to="/reglages" className="counted-card">
          <span className="counted-card__text">
            <span className="counted-card__label">{t("stats.countedGroups")}</span>
            <span>{groupNames}</span>
          </span>
          <span className="counted-card__edit">{t("stats.edit")}</span>
        </Link>
      </div>
    </div>
  );
}

function CountedLink({ label }: { label: string }) {
  const { t } = useI18n();
  return (
    <Link to="/reglages" className="counted-link">
      {label} <span className="counted-link__edit">{t("stats.edit")}</span>
    </Link>
  );
}

/** A breakdown: one bar per row, numbers always written (spec §8). */
function Breakdown({ title, rows, note, controls, plain = false }: { title: string; rows: BreakdownRow[]; note?: string; controls?: ReactNode; plain?: boolean }) {
  const id = `breakdown-${title.replace(/\W+/g, "-").toLowerCase()}`;
  return (
    <section aria-labelledby={id} className={`breakdown ${plain ? "breakdown--plain" : ""}`}>
      <div className="breakdown__header">
        <h2 id={id} className="breakdown__title">
          {title}
        </h2>
        {controls}
      </div>
      {rows.map((row) => (
        <div key={row.key} className={`breakdown-row ${row.muted ? "breakdown-row--muted" : ""}`}>
          <span className="breakdown-row__label">
            <span className="breakdown-row__swatch" style={{ background: row.color }} />
            {row.label}
          </span>
          <ProgressBar progress={row.progress} color={row.color} className="breakdown-row__bar" label={row.label} />
          <span className="breakdown-row__count">{`${row.progress.owned}/${row.progress.total}`}</span>
        </div>
      ))}
      {note && <p className="breakdown__note">{note}</p>}
    </section>
  );
}
