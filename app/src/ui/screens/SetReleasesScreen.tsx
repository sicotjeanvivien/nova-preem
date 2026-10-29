import { useState } from "react";
import { Link, Navigate, useParams, useSearchParams } from "react-router";
import { localize } from "../../domain/catalog.ts";
import { releasesOfSet } from "../../domain/catalogIndex.ts";
import { percentFloor, releaseVariants } from "../../domain/completion.ts";
import { normalizeText } from "../../domain/search.ts";
import { RELEASE_GROUP_ORDER } from "../../domain/sets.ts";
import { releaseShortName } from "../../domain/setTabs.ts";
import { useI18n } from "../../i18n/i18n.tsx";
import type { MessageKey } from "../../i18n/messages.ts";
import { useIsDesktop } from "../../platform/media.ts";
import { useApp } from "../AppContext.tsx";
import { useCollection } from "../CollectionContext.tsx";
import { ChevronLeftIcon } from "../icons.tsx";
import { languageLabel } from "../labels.ts";
import { ProgressBar } from "../ProgressBar.tsx";
import { SyncPill } from "../SyncIndicators.tsx";
import { useDocumentTitle } from "./useDocumentTitle.ts";

const RIBBON_COLORS: Record<string, string> = {
  main: "var(--color-accent)",
  starter: "var(--color-vf)",
  demo: "var(--color-text-muted)",
  promo: "var(--color-rarity-epic)",
  unknown: "var(--color-border-dashed)",
};

/**
 * Sets, level 2 (SetReleases / WebSetReleases, spec §2.1): one tile per
 * release, grouped by type (main set, starters, demo decks, promos), with its
 * progress and languages; filter by name.
 */
export function SetReleasesScreen() {
  const { setId = "" } = useParams();
  const [params] = useSearchParams();
  const { index, settings } = useApp();
  const { quantities } = useCollection();
  const { t, language } = useI18n();
  const isDesktop = useIsDesktop();
  const [query, setQuery] = useState("");
  const set = index.sets.get(setId);
  const setName = set ? localize(set.name, language) : "";
  useDocumentTitle(setName);

  // Links of the former tabbed page (?tirage=…) lead to the cards of that release.
  const former = params.get("tirage");
  if (former && index.releases.get(former)?.setId === setId) return <Navigate to={`/sets/${setId}/${former}`} replace />;
  if (!set) return <Navigate to="/sets" replace />;

  const releases = releasesOfSet(index, setId).filter((release) => index.printingsByRelease.has(release.id));
  const shortName = (name: Record<string, string>) => releaseShortName(localize(name, language), setName);
  const words = normalizeText(query.trim());
  const groups = RELEASE_GROUP_ORDER.map((group) => ({
    group,
    releases: releases.filter((release) => release.group === group && normalizeText(shortName(release.name)).includes(words)),
  })).filter((g) => g.releases.length > 0);
  const languages = (codes: string[]) =>
    [...codes].sort((a, b) => (a === settings.entryLanguage ? 1 : 0) - (b === settings.entryLanguage ? 1 : 0));

  const filter = (
    <>
      <label htmlFor="releases-filter" className="visually-hidden">
        {t("releases.filterLabel")}
      </label>
      <input id="releases-filter" type="search" className="name-filter" placeholder={t("sets.filter")} value={query} onChange={(event) => setQuery(event.target.value)} />
    </>
  );
  const count = <span className="level-header__count">{t("sets.releases", { count: releases.length })}</span>;

  return (
    <div className="releases-screen">
      {isDesktop ? (
        <header className="level-header">
          <div className="level-header__titles">
            <span className="level-header__crumbs">
              <Link to="/sets">{t("sets.title")}</Link> / {t("sets.eyebrow", { order: set.order })}
            </span>
            <h1 className="level-header__title">{setName}</h1>
          </div>
          {filter}
          {count}
        </header>
      ) : (
        <header className="level-bar">
          <Link to="/sets" className="icon-button" aria-label={t("sets.back")}>
            <ChevronLeftIcon width={22} height={22} />
          </Link>
          <div className="level-bar__titles">
            <span className="level-bar__eyebrow">{t("sets.title")}</span>
            <h1 className="level-bar__title">{setName}</h1>
          </div>
          {count}
          <SyncPill />
        </header>
      )}
      <div className="releases-screen__body">
        {!isDesktop && filter}
        {groups.map(({ group, releases: list }) => (
          <section key={group} aria-labelledby={`group-${group}`} className="release-group">
            <h2 id={`group-${group}`} className="release-group__title">
              {t(`settings.group.${group}` as MessageKey)}
            </h2>
            <div className="release-tiles">
              {list.map((release) => {
                const progress = releaseVariants(index, [release.id], quantities);
                const percent = percentFloor(progress);
                const complete = percent === 100;
                return (
                  <Link key={release.id} to={`/sets/${setId}/${release.id}`} className="release-tile">
                    <span className="release-tile__banner">
                      <span className="release-tile__ribbon" style={{ background: RIBBON_COLORS[group] }}>
                        <span>{t(`releases.ribbon.${group}` as MessageKey)}</span>
                      </span>
                      <span className="release-tile__set">{setName}</span>
                      <span className="release-tile__name">{shortName(release.name)}</span>
                    </span>
                    <span className="release-tile__stats">
                      <span className="release-tile__count">{t("sets.ratio", progress)}</span>
                      <span className="release-tile__languages">
                        {languages(release.languages).map((code) => (
                          <span key={code} className={`language-chip language-chip--small language-chip--${code}`}>
                            {languageLabel(t, code)}
                          </span>
                        ))}
                      </span>
                      <span className={`release-tile__percent ${complete ? "release-tile__percent--complete" : ""}`}>{percent}&nbsp;%</span>
                    </span>
                    <ProgressBar
                      progress={progress}
                      color={complete ? "var(--color-accent)" : "var(--color-rarity-rare)"}
                      className="release-tile__bar"
                      label={shortName(release.name)}
                    />
                  </Link>
                );
              })}
            </div>
          </section>
        ))}
        {groups.length === 0 && <p className="set-page__empty">{t("releases.empty")}</p>}
      </div>
    </div>
  );
}
