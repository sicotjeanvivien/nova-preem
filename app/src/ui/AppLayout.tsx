import type { ComponentType, SVGProps } from "react";
import { NavLink, Outlet, ScrollRestoration, useMatch } from "react-router";
import { useI18n } from "../i18n/i18n.tsx";
import type { MessageKey } from "../i18n/messages.ts";
import { CollectionIcon, LogoIcon, SearchIcon, SetsIcon, SettingsIcon, StatsIcon } from "./icons.tsx";
import { useOnline } from "../platform/connectivity.ts";
import { useIsDesktop } from "../platform/media.ts";
import { CatalogUpdateDialog } from "./CatalogUpdate.tsx";
import { StatusText } from "./Status.tsx";
import { SyncFirstDialog } from "./SyncFirstDialog.tsx";
import { SyncPauseBanner, SyncSidebarLine } from "./SyncIndicators.tsx";
import { WifiOffIcon } from "./icons.tsx";

const TABS: { to: string; label: MessageKey; Icon: ComponentType<SVGProps<SVGSVGElement>> }[] = [
  { to: "/sets", label: "nav.sets", Icon: SetsIcon },
  { to: "/collection", label: "nav.collection", Icon: CollectionIcon },
  { to: "/recherche", label: "nav.search", Icon: SearchIcon },
  { to: "/stats", label: "nav.stats", Icon: StatsIcon },
  { to: "/reglages", label: "nav.settings", Icon: SettingsIcon },
];

/** Five tabs (spec §2): bottom bar on mobile, sidebar from 900 px (same markup, CSS layout). */
export function AppLayout() {
  const { t } = useI18n();
  // The card page is full screen on mobile (CardDetail): no bottom bar there.
  // The 3D view is full screen at every width (CardViewer / WebCardViewer).
  const onCardPage = useMatch("/cartes/:slug") !== null;
  const onViewer = useMatch("/cartes/:slug/3d") !== null;
  const online = useOnline();
  const isDesktop = useIsDesktop();
  return (
    <div className={`app ${onCardPage ? "app--full-page" : ""} ${onViewer ? "app--immersive" : ""}`}>
      <nav className="nav" aria-label={t("nav.label")}>
        {/* Two elements: on a single one, .brand's display would override the hiding of .nav__brand on mobile. */}
        <div className="nav__brand">
          <div className="brand">
            <LogoIcon width={22} height={22} />
            <span className="brand__name">{t("app.name")}</span>
          </div>
        </div>
        {TABS.map(({ to, label, Icon }) => (
          <NavLink key={to} to={to} className="nav__link">
            <Icon />
            {t(label)}
          </NavLink>
        ))}
        <div className="nav__footer">
          <StatusText />
          <SyncSidebarLine />
          <span>{t("legal.fanMade")}</span>
          <span>{t("legal.notEndorsed")}</span>
        </div>
      </nav>
      <main className="app__main">
        {!online && (
          <div role="status" className="offline-banner">
            <WifiOffIcon width={18} height={18} />
            {t(isDesktop ? "offline.browser" : "offline.device")}
          </div>
        )}
        <SyncPauseBanner variant={isDesktop ? "browser" : "device"} />
        <Outlet />
      </main>
      <CatalogUpdateDialog />
      <SyncFirstDialog />
      <ScrollRestoration />
    </div>
  );
}
