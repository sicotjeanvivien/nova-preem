import { useMemo, useState } from "react";
import { Link } from "react-router";
import { localize } from "../../domain/catalog.ts";
import { completedReleases } from "../../domain/completion.ts";
import { normalizeText } from "../../domain/search.ts";
import { summarizeSets } from "../../domain/sets.ts";
import { useI18n } from "../../i18n/i18n.tsx";
import { useIsDesktop } from "../../platform/media.ts";
import { useApp } from "../AppContext.tsx";
import { useCollection } from "../CollectionContext.tsx";
import { ChevronRightIcon, LogoIcon, SetIcon } from "../icons.tsx";
import { ProgressBar } from "../ProgressBar.tsx";
import { StatusPill } from "../Status.tsx";
import { useDocumentTitle } from "./useDocumentTitle.ts";

/**
 * Sets, level 1 (Main / WebSetList, spec §2.1): one tile per set with its
 * completed releases and a progress bar of the same ratio; filter by name.
 */
export function SetsScreen() {
  const { index } = useApp();
  const { quantities } = useCollection();
  const { t, language } = useI18n();
  const isDesktop = useIsDesktop();
  const [query, setQuery] = useState("");
  useDocumentTitle(t("sets.title"));

  const summaries = useMemo(() => summarizeSets(index.catalog), [index]);
  const visible = summaries.filter(({ set }) => normalizeText(localize(set.name, language)).includes(normalizeText(query.trim())));

  const filter = (
    <>
      <label htmlFor="sets-filter" className="visually-hidden">
        {t("sets.filterLabel")}
      </label>
      <input id="sets-filter" type="search" className="name-filter" placeholder={t("sets.filter")} value={query} onChange={(event) => setQuery(event.target.value)} />
    </>
  );
  const count = <span className="level-header__count">{t("sets.count", { count: summaries.length })}</span>;

  return (
    <>
      {!isDesktop && (
        <header className="topbar">
          <div className="brand">
            <LogoIcon width={22} height={22} />
            <span className="brand__name">{t("app.name")}</span>
          </div>
          <StatusPill />
        </header>
      )}
      {isDesktop ? (
        <header className="level-header">
          <h1 className="level-header__title">{t("sets.title")}</h1>
          {filter}
          {count}
        </header>
      ) : null}
      <div className="screen sets-screen">
        {!isDesktop && (
          <>
            <div className="sets-screen__title">
              <h1 className="screen__title">{t("sets.title")}</h1>
              {count}
            </div>
            {filter}
          </>
        )}
        <div className="set-tiles">
          {visible.map(({ set }) => {
            const progress = completedReleases(index, set.id, quantities);
            return (
              <Link key={set.id} to={`/sets/${set.id}`} className="set-tile">
                <span className="set-tile__icon">
                  <SetIcon width={isDesktop ? 32 : 30} height={isDesktop ? 32 : 30} />
                </span>
                <span className="set-tile__body">
                  <span className="set-tile__name">{localize(set.name, language)}</span>
                  <span className="set-tile__counts">{t("sets.ratioReleases", progress)}</span>
                  <ProgressBar progress={progress} color="var(--color-accent)" className="set-tile__bar" label={localize(set.name, language)} />
                </span>
                {!isDesktop && <ChevronRightIcon width={18} height={18} className="set-tile__chevron" />}
              </Link>
            );
          })}
        </div>
        {!isDesktop && <p className="screen__legal">{t("legal.footer")}</p>}
      </div>
    </>
  );
}
