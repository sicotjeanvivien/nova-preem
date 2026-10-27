import { useState } from "react";
import { useNavigate } from "react-router";
import { localize } from "../domain/catalog.ts";
import { releaseShortName } from "../domain/setTabs.ts";
import { useI18n } from "../i18n/i18n.tsx";
import { useIsDesktop } from "../platform/media.ts";
import { useApp } from "./AppContext.tsx";
import { LogoIcon } from "./icons.tsx";
import { languageLabel } from "./labels.ts";
import { Toast } from "./Toast.tsx";
import { useImportFlow } from "./useImportFlow.tsx";

/** Empty collection (States 4 / WebStates 4): start entering cards, or import a backup. */
export function EmptyCollection() {
  const { index, settings } = useApp();
  const { t, language } = useI18n();
  const isDesktop = useIsDesktop();
  const navigate = useNavigate();
  const [message, setMessage] = useState<{ id: number; text: string } | null>(null);
  const importFlow = useImportFlow((text) => setMessage({ id: Date.now(), text }));

  const release = index.releases.get(settings.entryReleaseId);
  const set = release ? index.sets.get(release.setId) : [...index.catalog.sets].sort((a, b) => a.order - b.order)[0];
  const entry = release && set ? `${releaseShortName(localize(release.name, language), localize(set.name, language))} ${languageLabel(t, settings.entryLanguage)}` : "";
  // Straight to the cards of the entry release, where cards are entered (spec §2.1).
  const start = () => navigate(release && set ? `/sets/${set.id}/${release.id}` : set ? `/sets/${set.id}` : "/sets");

  return (
    <div className="empty-collection">
      {!isDesktop && (
        <header className="topbar">
          <div className="brand">
            <LogoIcon width={22} height={22} />
            <span className="brand__name">{t("app.name")}</span>
          </div>
        </header>
      )}
      <div className="empty-collection__body">
        <div className="empty-collection__cards" aria-hidden="true">
          <span />
          <span />
          <span className="empty-collection__card--accent" />
        </div>
        <h1 className="empty-collection__title">{t(isDesktop ? "empty.titleBrowser" : "empty.titleDevice")}</h1>
        <p className="empty-collection__text">{isDesktop ? t("empty.textBrowser") : t("empty.textDevice", { entry })}</p>
        <div className="empty-collection__actions">
          <button type="button" className="button button--primary" onClick={start}>
            {t(isDesktop ? "empty.openSets" : "empty.start")}
          </button>
          <button type="button" className="button button--secondary" onClick={importFlow.open}>
            {t("empty.import")}
          </button>
        </div>
      </div>
      {importFlow.element}
      {message && <Toast key={message.id} text={message.text} />}
    </div>
  );
}
