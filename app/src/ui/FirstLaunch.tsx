import { createContext, useContext } from "react";
import { Link } from "react-router";
import type { CatalogErrorCode } from "../domain/catalogLoader.ts";
import { useI18n } from "../i18n/i18n.tsx";
import { LogoIcon } from "./icons.tsx";
import { legalPage } from "./legalPages.ts";
import { legalLinkState } from "./screens/LegalScreen.tsx";

export interface FirstLaunchProps {
  /** Fraction downloaded, or null when the size is unknown. */
  progress: number | null;
  error: CatalogErrorCode | null;
  onRetry: () => void;
}

/** The download state, for the first-launch route. */
export const FirstLaunchContext = createContext<FirstLaunchProps | null>(null);

/**
 * First launch (States 1 / WebStates 1): only the catalog download, no navigation,
 * except the privacy policy and legal notice (docs/legal-spec.md §2).
 */
export function FirstLaunch() {
  const { progress, error, onRetry } = useContext(FirstLaunchContext)!;
  const { t, percent } = useI18n();
  return (
    <div className="first-launch">
      <LogoIcon className="first-launch__logo" strokeWidth={1.4} />
      <h1 className="first-launch__name">{t("app.name")}</h1>
      <div className="first-launch__body">
        {error ? (
          <>
            <p className="first-launch__error" role="alert">
              {t(error === "network" ? "firstLaunch.error.network" : "firstLaunch.error.invalid")}
            </p>
            <button type="button" className="button button--primary" onClick={onRetry}>
              {t("firstLaunch.retry")}
            </button>
          </>
        ) : (
          <>
            <div className="first-launch__row">
              <span id="catalog-progress-label">{t("firstLaunch.downloading")}</span>
              {progress !== null && <span className="first-launch__percent">{percent(progress)}</span>}
            </div>
            <div
              className={`progress ${progress === null ? "progress--indeterminate" : ""}`}
              role="progressbar"
              aria-labelledby="catalog-progress-label"
              aria-valuemin={0}
              aria-valuemax={100}
              {...(progress !== null && { "aria-valuenow": Math.floor(progress * 100) })}
            >
              <div className="progress__bar" style={progress === null ? undefined : { width: `${progress * 100}%` }} />
            </div>
            <span className="first-launch__text">{t("firstLaunch.explanation")}</span>
          </>
        )}
      </div>
      <div className="first-launch__note">{t("firstLaunch.images")}</div>
      <nav className="first-launch__legal" aria-label={t("legal.links")}>
        {(["privacy", "legal"] as const).map((id) => (
          <Link key={id} to={legalPage(id).path} state={legalLinkState("legal.firstLaunch")}>
            {t(legalPage(id).label)}
          </Link>
        ))}
      </nav>
    </div>
  );
}
