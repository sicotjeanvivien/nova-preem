import { useEffect, useState, type ReactNode } from "react";
import { Link, useLocation } from "react-router";
import { localize, type ReleaseGroup } from "../../domain/catalog.ts";
import { releasesOfSet } from "../../domain/catalogIndex.ts";
import type { CatalogCheck } from "../../domain/catalogLoader.ts";
import { interfaceLanguages, resolveInterfaceLanguage, type Settings } from "../../domain/settings.ts";
import { releaseShortName } from "../../domain/setTabs.ts";
import { useI18n } from "../../i18n/i18n.tsx";
import type { MessageKey } from "../../i18n/messages.ts";
import { downloadImages, useImageDownload } from "../../platform/imageDownload.ts";
import { useIsDesktop } from "../../platform/media.ts";
import { useApp } from "../AppContext.tsx";
import { useCatalogUpdate } from "../CatalogUpdate.tsx";
import { useDataActions } from "../dataActions.ts";
import { SyncCard } from "../SyncCard.tsx";
import { useSync } from "../SyncContext.tsx";
import { useImportFlow } from "../useImportFlow.tsx";
import { languageLabel } from "../labels.ts";
import { Toast } from "../Toast.tsx";
import { SyncPill } from "../SyncIndicators.tsx";
import { ChevronRightIcon } from "../icons.tsx";
import { LEGAL_PAGES } from "../legalPages.ts";
import { legalLinkState } from "./LegalScreen.tsx";
import { useDocumentTitle } from "./useDocumentTitle.ts";

const GROUPS: ReleaseGroup[] = ["main", "starter", "demo", "promo"];
const INTERFACE_NAMES: Record<string, string> = { fr: "Français", en: "English" };

/**
 * Settings (Settings / WebSettings, docs/app-spec.md §7): entry, completion,
 * display, and data (catalog, export, import, CSV). Changes apply at once.
 */
export function SettingsScreen() {
  const { index, catalog, settings, updateSettings, services } = useApp();
  const { t, language: uiLanguage } = useI18n();
  const isDesktop = useIsDesktop();
  const { exportCollection, exportCsv } = useDataActions();
  const images = useImageDownload();
  const catalogUpdate = useCatalogUpdate();
  const sync = useSync();
  const syncOn = sync.available && sync.status !== "disabled";
  const [check, setCheck] = useState<CatalogCheck | "checking" | null>(null);
  const [message, setMessage] = useState<{ id: number; text: string } | null>(null);
  const importFlow = useImportFlow((text) => setMessage({ id: Date.now(), text }));
  useDocumentTitle(t("settings.title"));

  // The sync indicators lead here (/reglages#sync): show the sync card.
  const { hash } = useLocation();
  useEffect(() => {
    if (hash === "#sync") document.getElementById("sync")?.scrollIntoView?.({ block: "start" });
  }, [hash]);

  const set = [...index.catalog.sets].sort((a, b) => a.order - b.order)[0];
  const setName = set ? localize(set.name, uiLanguage) : "";
  const releases = set ? releasesOfSet(index, set.id).filter((release) => index.printingsByRelease.has(release.id)) : [];
  const shortName = (name: Record<string, string>) => releaseShortName(localize(name, uiLanguage), setName);
  const entryRelease = index.releases.get(settings.entryReleaseId);
  const languages = index.catalog.languages.slice().sort((a, b) => (a === settings.entryLanguage ? -1 : 0) - (b === settings.entryLanguage ? -1 : 0));

  const groupDetail = (group: ReleaseGroup) => {
    const names = [...new Set(releases.filter((r) => r.group === group).map((r) => shortName(r.name).replace(/ — (Retail|Beta)$/, "")))];
    return names.length > 3 ? `${names.slice(0, 3).join(", ")}…` : names.join(", ");
  };
  const toggleGroup = (group: ReleaseGroup) => {
    const next = settings.completionGroups.includes(group)
      ? settings.completionGroups.filter((g) => g !== group)
      : GROUPS.filter((g) => g === group || settings.completionGroups.includes(g));
    // At least one group stays counted, or every measure would be 0 / 0.
    if (next.length > 0) updateSettings({ completionGroups: next });
  };

  // A new catalog opens the update sheet (States 3); the result also shows here.
  const runCheck = async () => {
    setCheck("checking");
    setCheck(await catalogUpdate.check());
  };
  const downloadAll = async () => {
    const urls = index.catalog.printings.flatMap((printing) =>
      printing.image ? [new URL(printing.image.thumbPath, services.imageBaseUrl).href, new URL(printing.image.path, services.imageBaseUrl).href] : [],
    );
    await downloadImages(urls);
    updateSettings({ downloadAllImages: true });
  };

  const chip = (pressed: boolean, label: string, onClick: () => void, key: string) => (
    <button key={key} type="button" aria-pressed={pressed} className="filter-pill" onClick={onClick}>
      {label}
    </button>
  );

  return (
    <div className={`settings ${isDesktop ? "settings--desktop" : ""}`}>
      {isDesktop ? (
        <h1 className="settings__title">{t("settings.title")}</h1>
      ) : (
        <header className="topbar">
          <h1>{t("settings.title")}</h1>
          <SyncPill />
        </header>
      )}
      <div className="settings__grid">
        <Section id="entry" title={t("settings.section.entry")}>
          <div className="settings-row settings-row--stacked">
            <span>{t("settings.entryRelease")}</span>
            <div role="group" aria-label={t("settings.entryRelease")} className="chip-wrap">
              {releases
                .filter((release) => release.group === "main" || release.group === "starter")
                .map((release) => chip(release.id === settings.entryReleaseId, shortName(release.name), () => updateSettings({ entryReleaseId: release.id }), release.id))}
            </div>
          </div>
          <div className="settings-row">
            <span>{t("settings.entryLanguage")}</span>
            <div role="group" aria-label={t("settings.entryLanguage")} className="segmented">
              {languages.map((code) => (
                <button
                  key={code}
                  type="button"
                  aria-pressed={code === settings.entryLanguage}
                  className={`segmented__option segmented__option--${code}`}
                  onClick={() => updateSettings({ entryLanguage: code })}
                >
                  {languageLabel(t, code)}
                </button>
              ))}
            </div>
          </div>
          <p className="settings__note">
            {t(isDesktop ? "settings.entryNoteClick" : "settings.entryNoteTap", {
              label: `${entryRelease ? shortName(entryRelease.name) : settings.entryReleaseId} · ${languageLabel(t, settings.entryLanguage)}`,
            })}
          </p>
        </Section>

        <Section id="completion" title={t("settings.section.completion")}>
          {GROUPS.filter((group) => releases.some((r) => r.group === group)).map((group) => {
            const label = t(`settings.group.${group}` as MessageKey);
            return (
              <div key={group} className="settings-row">
                <span className="settings-row__text">
                  <span>{label}</span>
                  <span className="settings-row__hint">{groupDetail(group)}</span>
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={settings.completionGroups.includes(group)}
                  aria-label={t("settings.countGroup", { group: label })}
                  className="switch switch--large"
                  onClick={() => toggleGroup(group)}
                >
                  <span className="switch__track">
                    <span className="switch__thumb" />
                  </span>
                </button>
              </div>
            );
          })}
          <div className="settings-row">
            <span>{t("settings.threshold", { count: settings.duplicateThreshold })}</span>
            <span className="stepper">
              <button
                type="button"
                className="stepper__button"
                aria-label={t("settings.thresholdDown")}
                disabled={settings.duplicateThreshold <= 1}
                onClick={() => updateSettings({ duplicateThreshold: settings.duplicateThreshold - 1 })}
              >
                −
              </button>
              <button
                type="button"
                className="stepper__button"
                aria-label={t("settings.thresholdUp")}
                disabled={settings.duplicateThreshold >= 9}
                onClick={() => updateSettings({ duplicateThreshold: settings.duplicateThreshold + 1 })}
              >
                +
              </button>
            </span>
          </div>
        </Section>

        <Section id="display" title={t("settings.section.display")}>
          <div className="settings-row settings-row--stacked">
            <span>{t("settings.cardNames")}</span>
            <div role="group" aria-label={t("settings.cardNames")} className="chip-wrap">
              {(["entry", "fr", "en"] as const).map((value) =>
                chip(settings.cardNameLanguage === value, t(`settings.names.${value}`), () => updateSettings({ cardNameLanguage: value }), value),
              )}
            </div>
          </div>
          <div className="settings-row">
            <span>{t("settings.interfaceLanguage")}</span>
            <div role="group" aria-label={t("settings.interfaceLanguage")} className="segmented">
              {interfaceLanguages.map((code) => (
                <button
                  key={code}
                  type="button"
                  lang={code}
                  aria-pressed={resolveInterfaceLanguage(settings.interfaceLanguage, navigator.languages) === code}
                  className="segmented__option segmented__option--neutral"
                  onClick={() => updateSettings({ interfaceLanguage: code satisfies Settings["interfaceLanguage"] })}
                >
                  {INTERFACE_NAMES[code]}
                </button>
              ))}
            </div>
          </div>
          <div className="settings-row">
            <span className="settings-row__text">
              <span>{t("settings.images")}</span>
              <span className="settings-row__hint" aria-live="polite">
                {images.status === "running"
                  ? t("settings.imagesProgress", { done: images.done, total: images.total })
                  : images.status === "finished"
                    ? images.failed > 0
                      ? t("settings.imagesFailed", { count: images.failed })
                      : t("settings.imagesDone", { total: images.total })
                    : t("settings.imagesHint")}
              </span>
            </span>
            <button type="button" className="secondary-button" disabled={images.status === "running"} onClick={() => void downloadAll()}>
              {t("settings.imagesButton")}
            </button>
          </div>
        </Section>

        {/* Desktop: the sync is a card of its own, before Data (WebSettings). */}
        {sync.available && isDesktop && <SyncCard />}
        <Section id="data" title={t("settings.section.data")} before={sync.available && !isDesktop ? <SyncCard /> : null}>
          <div className="settings-row">
            <span className="settings-row__text">
              <span>{t("settings.catalog")}</span>
              <span className="settings-row__hint mono">{t("settings.catalogInfo", { version: catalog.manifest.version, cards: catalog.manifest.counts.cards })}</span>
              {check && (
                <span className="settings-row__hint" role="status">
                  {check === "checking"
                    ? t("settings.checking")
                    : check.status === "up-to-date"
                      ? t("settings.upToDate")
                      : check.status === "available"
                        ? t("settings.updateAvailable", { version: check.manifest.version })
                        : t("settings.checkFailed")}
                </span>
              )}
            </span>
            <button type="button" className="secondary-button" disabled={check === "checking"} onClick={() => void runCheck()}>
              {t("settings.check")}
            </button>
          </div>
          <div className="data-actions">
            <button type="button" className="data-button" onClick={exportCollection}>
              {t("settings.export")}
            </button>
            <button type="button" className="data-button" onClick={importFlow.open}>
              {t("settings.import")}
            </button>
            <button type="button" className="data-button" onClick={exportCsv}>
              {t("settings.csv")}
            </button>
            {importFlow.element}
          </div>
          <p className="settings__note settings__note--data">
            {syncOn ? (
              t("settings.dataNoteSync")
            ) : (
              <>
                {t("settings.dataNoteBefore")}
                <span className="mono">nova-preem-collection.json</span>
                {t("settings.dataNoteAfter")}
              </>
            )}
          </p>
          {/* A build without a Google client ID keeps the MVP's "Bientôt" row. */}
          {!sync.available && (
            <div className="settings-row settings-row--disabled" aria-disabled="true">
              <span className="settings-row__text">
                <span>{t("settings.sync")}</span>
                <span className="settings-row__hint">{t("settings.syncLater")}</span>
              </span>
              <span className="soon-badge">{t("settings.soon")}</span>
            </div>
          )}
        </Section>

        <Section id="about" title={t("settings.about")}>
          {LEGAL_PAGES.map((page) => (
            <Link key={page.id} className="settings-row settings-row--link" to={page.path} state={legalLinkState("nav.settings")}>
              {t(page.settingsLabel)}
              <ChevronRightIcon width={16} height={16} />
            </Link>
          ))}
          <div className="settings-row settings-row--version">
            <span>{t("settings.appVersion")}</span>
            <span className="mono">{services.appVersion}</span>
          </div>
        </Section>
      </div>
      <p className="settings__legal">
        <span className="legal-line">{t("legal.settings")}</span>
        <span className="legal-line">{t("legal.settingsRights")}</span>
      </p>

      {message && <Toast key={message.id} text={message.text} />}
    </div>
  );
}

function Section({ id, title, before, children }: { id: string; title: string; before?: ReactNode; children: ReactNode }) {
  return (
    <section aria-labelledby={`settings-${id}`} className="settings-section">
      <h2 id={`settings-${id}`} className="settings-section__title">
        {title}
      </h2>
      {before}
      <div className="settings-card">{children}</div>
    </section>
  );
}
