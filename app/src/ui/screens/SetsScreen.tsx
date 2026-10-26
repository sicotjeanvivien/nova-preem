import { useMemo } from "react";
import { localize } from "../../domain/catalog.ts";
import { summarizeSets } from "../../domain/sets.ts";
import { useI18n } from "../../i18n/i18n.tsx";
import type { MessageKey } from "../../i18n/messages.ts";
import { useApp } from "../AppContext.tsx";
import { LogoIcon } from "../icons.tsx";
import { StatusPill } from "../Status.tsx";
import { useDocumentTitle } from "./useDocumentTitle.ts";

/**
 * Sets, level 1 (Main / WebSetList). Step 1: the set blocks with their real
 * counts; progress bars and the link to the set page come with step 2.
 */
export function SetsScreen() {
  const { catalog } = useApp();
  const { t, language } = useI18n();
  useDocumentTitle(t("sets.title"));
  const summaries = useMemo(() => summarizeSets(catalog.catalog), [catalog]);

  const languageList = (languages: string[]) => {
    const labels = languages.map((code) => t(`language.short.${code}` as MessageKey));
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
          {summaries.map(({ set, releaseCount, cardCount, languages }) => (
            <section key={set.id} className="set-card" aria-labelledby={`set-${set.id}`}>
              <div className="set-card__heading">
                <span className="set-card__eyebrow">{t("sets.eyebrow", { order: set.order })}</span>
                <h2 id={`set-${set.id}`} className="set-card__name">
                  {localize(set.name, language)}
                </h2>
                <span className="set-card__summary">
                  {[t("sets.releases", { count: releaseCount }), t("sets.cards", { count: cardCount }), languageList(languages)].join(" · ")}
                </span>
              </div>
            </section>
          ))}
        </div>
        <p className="screen__legal mobile-only">{t("legal.footer")}</p>
      </div>
    </>
  );
}
