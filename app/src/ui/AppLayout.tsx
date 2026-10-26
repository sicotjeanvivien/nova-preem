import type { ComponentType, SVGProps } from "react";
import { NavLink, Outlet, ScrollRestoration, useMatch } from "react-router";
import { useI18n } from "../i18n/i18n.tsx";
import type { MessageKey } from "../i18n/messages.ts";
import { CollectionIcon, LogoIcon, SearchIcon, SetsIcon, SettingsIcon, StatsIcon } from "./icons.tsx";
import { StatusText } from "./Status.tsx";

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
  const onCardPage = useMatch("/cartes/:slug") !== null;
  return (
    <div className={`app ${onCardPage ? "app--full-page" : ""}`}>
      <nav className="nav" aria-label={t("nav.label")}>
        <div className="nav__brand brand">
          <LogoIcon width={22} height={22} />
          <span className="brand__name">{t("app.name")}</span>
        </div>
        {TABS.map(({ to, label, Icon }) => (
          <NavLink key={to} to={to} className="nav__link">
            <Icon />
            {t(label)}
          </NavLink>
        ))}
        <div className="nav__footer">
          <StatusText />
          <span>{t("legal.fanMade")}</span>
        </div>
      </nav>
      <main className="app__main">
        <Outlet />
      </main>
      <ScrollRestoration />
    </div>
  );
}
