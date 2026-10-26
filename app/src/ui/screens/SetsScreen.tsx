import { useMemo } from "react";
import { Link } from "react-router";
import { localize } from "../../domain/catalog.ts";
import { releasesOfSet } from "../../domain/catalogIndex.ts";
import { masterSet, percentFloor, playableSet, releaseInLanguage } from "../../domain/completion.ts";
import { buildSetTabs, releaseShortName } from "../../domain/setTabs.ts";
import { summarizeSets } from "../../domain/sets.ts";
import { useI18n } from "../../i18n/i18n.tsx";
import { useApp } from "../AppContext.tsx";
import { useCollection } from "../CollectionContext.tsx";
import { ChevronRightIcon, LogoIcon } from "../icons.tsx";
import { languageLabel } from "../labels.ts";
import { ProgressBar } from "../ProgressBar.tsx";
import { StatusPill } from "../Status.tsx";
import { useDocumentTitle } from "./useDocumentTitle.ts";
import { useTabLabel } from "./useTabLabel.ts";

/** Sets, level 1 (Main / WebSetList): one block per set with its progress. */
export function SetsScreen() {
  const { index, settings } = useApp();
  const { quantities } = useCollection();
  const { t, language } = useI18n();
  const tabLabel = useTabLabel();
  useDocumentTitle(t("sets.title"));

  const summaries = useMemo(() => summarizeSets(index.catalog), [index]);

  const languageList = (languages: string[]) => {
    const labels = languages.map((code) => languageLabel(t, code));
    return labels.length === 2 ? t("language.and", { a: labels[0]!, b: labels[1]! }) : labels.join(", ");
  };

  return (
    <>
      <header className="topbar mobile-only">
        <div className="brand">
          <LogoIcon width={22} height={22} />
          <span className="brand__name">{t("app.name")}</span>
        </div>
        <StatusPill />
      </header>
      <div className="screen">
        <h1 className="screen__title">{t("sets.title")}</h1>
        <div className="set-grid">
          {summaries.map(({ set, releaseCount, cardCount, languages }) => {
            const playable = playableSet(index, set.id, settings.completionGroups, quantities);
            const master = masterSet(index, set.id, settings.completionGroups, quantities);
            const entryRelease = index.releases.get(settings.entryReleaseId);
            const entry =
              entryRelease?.setId === set.id ? releaseInLanguage(index, entryRelease.id, settings.entryLanguage, quantities) : null;
            const setName = localize(set.name, language);
            const tabs = buildSetTabs(releasesOfSet(index, set.id), (release) => index.printingsByRelease.has(release.id));
            const bars = [
              { key: "playable", label: t("sets.playable"), progress: playable, color: "var(--color-accent)", cards: true },
              { key: "master", label: t("sets.master"), progress: master, color: "var(--color-rarity-epic)", cards: false },
              ...(entry && entryRelease
                ? [
                    {
                      key: "entry",
                      label: t("sets.inLanguage", {
                        release: releaseShortName(localize(entryRelease.name, language), setName),
                        language: languageLabel(t, settings.entryLanguage),
                      }),
                      progress: entry,
                      color: settings.entryLanguage === "fr" ? "var(--color-vf)" : "var(--color-vo)",
                      cards: false,
                    },
                  ]
                : []),
            ];
            return (
              <Link key={set.id} to={`/sets/${set.id}`} className="set-card set-card--link">
                <div className="set-card__top">
                  <div className="set-card__heading">
                    <span className="set-card__eyebrow">{t("sets.eyebrow", { order: set.order })}</span>
                    <h2 className="set-card__name">{setName}</h2>
                    <span className="set-card__summary">
                      {[t("sets.releases", { count: releaseCount }), t("sets.cards", { count: cardCount }), languageList(languages)].join(" · ")}
                    </span>
                  </div>
                  <div className="set-card__score">
                    <div className="set-card__percent">{percentFloor(playable)}&nbsp;%</div>
                    <div className="set-card__caption">{t("sets.playableCaption")}</div>
                  </div>
                </div>
                <div className="set-card__bars">
                  {bars.map((bar) => (
                    <div key={bar.key} className="set-bar">
                      <span className="set-bar__label">{bar.label}</span>
                      <ProgressBar progress={bar.progress} color={bar.color} className="set-bar__track" label={bar.label} />
                      <span className="set-bar__count">
                        <span className="mobile-only">{t(bar.cards ? "sets.ratioCards" : "sets.ratio", bar.progress)}</span>
                        <span className="desktop-only">{t("sets.ratio", bar.progress)}</span>
                      </span>
                    </div>
                  ))}
                </div>
                <div className="chips">
                  {tabs.map((tab) => (
                    <span key={tab.id} className="chip">
                      {tabLabel(tab, setName)}
                    </span>
                  ))}
                </div>
                <span className="set-card__open">
                  {t("sets.open")}
                  <ChevronRightIcon width={16} height={16} />
                </span>
              </Link>
            );
          })}
        </div>
        <p className="screen__legal mobile-only">{t("legal.footer")}</p>
      </div>
    </>
  );
}
