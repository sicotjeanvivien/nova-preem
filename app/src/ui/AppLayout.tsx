import type { ComponentType, SVGProps } from "react";
import { NavLink, Outlet, ScrollRestoration, useLocation, useMatch } from "react-router";
import { useI18n } from "../i18n/i18n.tsx";
import type { MessageKey } from "../i18n/messages.ts";
import { CollectionIcon, SearchIcon, SetsIcon, SettingsIcon, StatsIcon } from "./icons.tsx";
import { LogoName, LogoSymbol } from "./Logo.tsx";
import { useIsDesktop } from "../platform/media.ts";
import { CatalogUpdateDialog } from "./CatalogUpdate.tsx";
import { OfflineNoticeProvider } from "./OfflineNotice.tsx";
import { SyncFirstDialog } from "./SyncFirstDialog.tsx";
import { SidebarPills, SyncPauseBanner } from "./SyncIndicators.tsx";
import { LEGAL_PAGES } from "./legalPages.ts";
import { LegalLinks } from "./screens/LegalScreen.tsx";

const TABS: { to: string; label: MessageKey; Icon: ComponentType<SVGProps<SVGSVGElement>> }[] = [
  { to: "/sets", label: "nav.sets", Icon: SetsIcon },
  { to: "/collection", label: "nav.collection", Icon: CollectionIcon },
  { to: "/recherche", label: "nav.search", Icon: SearchIcon },
  { to: "/stats", label: "nav.stats", Icon: StatsIcon },
  { to: "/reglages", label: "nav.settings", Icon: SettingsIcon },
];

/**
 * Five tabs (spec §2): bottom bar on mobile, sidebar from 900 px (same markup,
 * CSS layout). The sidebar and its footer (pills, fan-made, legal pages) are
 * the same on every screen.
 */
export function AppLayout() {
  const { t } = useI18n();
  // The card page is full screen on mobile (CardDetail): no bottom bar there.
  // The 3D view is full screen at every width (CardViewer / WebCardViewer).
  // So are the legal pages (Legal mockup).
  const location = useLocation();
  const onCardPage = useMatch("/cartes/:slug") !== null || LEGAL_PAGES.some((page) => page.path === location.pathname);
  const onViewer = useMatch("/cartes/:slug/3d") !== null;
  const isDesktop = useIsDesktop();
  return (
    <OfflineNoticeProvider>
      <div className={`app ${onCardPage ? "app--full-page" : ""} ${onViewer ? "app--immersive" : ""}`}>
        <nav className="nav" aria-label={t("nav.label")}>
          {/* Two elements: on a single one, .brand's display would override the hiding of .nav__brand on mobile. */}
          <div className="nav__brand">
            <div className="brand">
              <LogoSymbol className="brand__symbol" />
              <LogoName className="brand__name" />
            </div>
          </div>
          {TABS.map(({ to, label, Icon }) => (
            <NavLink key={to} to={to} className="nav__link">
              <Icon />
              {t(label)}
            </NavLink>
          ))}
          <div className="nav__footer">
            <SidebarPills />
            <p className="nav__notice">
              <span>{t("legal.fanMade")}</span>
              <span>{t("legal.notEndorsed")}</span>
            </p>
            <LegalLinks />
          </div>
        </nav>
        <main className="app__main">
          <SyncPauseBanner variant={isDesktop ? "browser" : "device"} />
          <Outlet />
        </main>
        <CatalogUpdateDialog />
        <SyncFirstDialog />
        <ScrollRestoration />
      </div>
    </OfflineNoticeProvider>
  );
}
