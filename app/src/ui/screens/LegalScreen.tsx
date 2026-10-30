import type { MouseEvent } from "react";
import { useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import texts from "virtual:legal-pages";
import { useI18n } from "../../i18n/i18n.tsx";
import type { MessageKey } from "../../i18n/messages.ts";
import { ChevronLeftIcon } from "../icons.tsx";
import { LEGAL_PAGES, type LegalPageId } from "../legalPages.ts";
import { useDocumentTitle } from "./useDocumentTitle.ts";

/** History state of a legal page: the screen it was opened from, for the back button. */
interface LegalLinkState {
  legalFrom: { label: MessageKey | null };
}

/** State for a link to a legal page; `label` names the screen of origin ("Back to Settings"). */
export function legalLinkState(label: MessageKey | null): LegalLinkState {
  return { legalFrom: { label } };
}

function readLegalLinkState(state: unknown): LegalLinkState["legalFrom"] | null {
  return state && typeof state === "object" && "legalFrom" in state ? (state as LegalLinkState).legalFrom : null;
}

const LEGAL_PATHS = new Set(LEGAL_PAGES.map((page) => page.path));

/**
 * A legal page (Legal / WebLegal mockups, docs/legal-spec.md): the text of docs/legal/ in the
 * interface language, links to the other three pages. It needs no catalog: it also opens
 * from the first launch, before the catalog is downloaded.
 */
export function LegalScreen({ id }: { id: LegalPageId }) {
  const { t, language } = useI18n();
  const location = useLocation();
  const navigate = useNavigate();
  const text = texts[language][id];
  const from = readLegalLinkState(location.state);
  useDocumentTitle(text.title);

  // Anchors of the texts (#google-drive): the browser cannot scroll to them before the page is rendered.
  useEffect(() => {
    if (location.hash) document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView();
  }, [id, location.hash]);

  // Back to the screen of origin, Settings by default (spec §3).
  const backLabel = from ? (from.label ? t(from.label) : null) : t("nav.settings");
  const goBack = () => (from ? navigate(-1) : navigate("/reglages"));
  // Between legal pages, the history entry is replaced: back still returns to the screen of origin.
  const open = (path: string) => navigate(path, { replace: LEGAL_PATHS.has(path.split("#")[0]!), state: location.state });

  // The texts' internal links (/confidentialite…) go through the router; the others are left to the browser.
  const onTextClick = (event: MouseEvent<HTMLDivElement>) => {
    const link = (event.target as Element).closest("a");
    const href = link?.getAttribute("href");
    if (!href?.startsWith("/") || link!.target || event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
    event.preventDefault();
    open(href);
  };

  const backText = backLabel ? t("legal.backTo", { label: backLabel }) : t("legal.back");
  return (
    <div className="legal-page">
      <header className="legal-header">
        <button type="button" className="icon-button" aria-label={backText} onClick={goBack}>
          <ChevronLeftIcon width={22} height={22} />
        </button>
        <span className="legal-header__titles">
          <span className="legal-header__back">{backText}</span>
          <h1 className="legal-header__title">{text.title}</h1>
        </span>
      </header>
      <article className="legal">
        <button type="button" className="legal__back" onClick={goBack}>
          <ChevronLeftIcon width={16} height={16} />
          {backLabel ?? t("legal.back")}
        </button>
        <h1 className="legal__title">{text.title}</h1>
        <div className="legal__text" onClick={onTextClick} dangerouslySetInnerHTML={{ __html: text.html }} />
        <nav className="legal__others" aria-label={t("legal.otherPages")}>
          {LEGAL_PAGES.filter((page) => page.id !== id).map((page) => (
            <Link key={page.id} to={page.path} replace state={location.state}>
              {t(page.label)}
            </Link>
          ))}
        </nav>
        <p className="legal__footer">
          {t("legal.fanMade")} · {t("legal.notEndorsed")}
        </p>
      </article>
    </div>
  );
}

const TAB_LABELS: [string, MessageKey][] = [
  ["/sets", "nav.sets"],
  ["/collection", "nav.collection"],
  ["/recherche", "nav.search"],
  ["/stats", "nav.stats"],
  ["/reglages", "nav.settings"],
];

/** Links to the four pages, for the desktop sidebar: back returns to the current screen. */
export function LegalLinks() {
  const { t } = useI18n();
  const location = useLocation();
  const onLegalPage = LEGAL_PATHS.has(location.pathname);
  // A card page (or any screen outside the tabs) has no short name: "Back".
  const label = TAB_LABELS.find(([prefix]) => location.pathname.startsWith(prefix))?.[1] ?? null;
  return (
    <nav className="legal-links" aria-label={t("legal.links")}>
      {LEGAL_PAGES.map((page) => (
        <Link key={page.id} to={page.path} replace={onLegalPage} state={onLegalPage ? location.state : legalLinkState(label)}>
          {t(page.label)}
        </Link>
      ))}
    </nav>
  );
}
