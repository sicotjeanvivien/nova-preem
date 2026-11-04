import { useI18n } from "../i18n/i18n.tsx";
import { useApp } from "./AppContext.tsx";
import { ExternalLinkIcon, SupportIcon } from "./icons.tsx";

/**
 * "Nous soutenir" (docs/legal-spec.md §7; Settings / WebSettings mockups): at the
 * bottom of Settings, just before "À propos", on mobile and desktop. A plain link
 * to the Ko-fi page (VITE_KOFI_URL); without it, no card. Never a pop-up, a reminder
 * or a donor badge: the app does not know who donated.
 */
export function SupportCard() {
  const { services } = useApp();
  const { t } = useI18n();
  if (!services.supportUrl) return null;
  return (
    <section aria-labelledby="settings-support" className="support-card">
      <h2 id="settings-support" className="settings-section__title">
        {t("support.title")}
      </h2>
      <div className="support-card__body">
        <span className="support-card__icon">
          <SupportIcon width={20} height={20} />
        </span>
        <p className="support-card__text">{t("support.text")}</p>
      </div>
      <a className="support-card__link" href={services.supportUrl} target="_blank" rel="noopener noreferrer">
        {t("support.button")}
        <ExternalLinkIcon width={14} height={14} />
      </a>
      <p className="settings__note">{t("support.note")}</p>
    </section>
  );
}
