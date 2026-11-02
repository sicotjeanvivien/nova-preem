import { Link } from "react-router";
import { useI18n } from "../i18n/i18n.tsx";
import type { MessageKey } from "../i18n/messages.ts";
import { useOnline } from "../platform/connectivity.ts";
import { CloudIcon, WifiOffIcon } from "./icons.tsx";
import { useShowOfflineNotice } from "./OfflineNotice.tsx";
import { syncPillLabel } from "./SyncCard.tsx";
import { useSync } from "./SyncContext.tsx";

// Sync and network status outside Settings (docs/sync-spec.md §8, element 4;
// docs/app-spec.md §8; SyncIndicators mockup and "Éléments communs" note of the canvas).
// The same two indicators everywhere: the Drive cloud (nothing while the sync
// is off) and, without network, the offline one, which shows the offline toast.

/** Where the indicators lead: Settings → Data, on the sync card. */
export const SYNC_SETTINGS_PATH = "/reglages#sync";

/**
 * Mobile: right of each tab's header (Sets, set releases, Collection, Search,
 * Stats, Settings, empty collection). Without network, the amber offline icon
 * comes first. The cloud is an icon in a circle while up to date (label for
 * screen readers), a worded pill otherwise. 44 px tap areas.
 */
export function HeaderIndicators() {
  const { status, pendingChanges } = useSync();
  const online = useOnline();
  const showOffline = useShowOfflineNotice();
  const { t } = useI18n();
  const syncOn = status !== "disabled";
  if (online && !syncOn) return null;
  const label = syncPillLabel(t, status, pendingChanges);
  return (
    <span className="header-indicators">
      {!online && (
        <button type="button" className="header-indicator header-indicator--offline" aria-label={t("status.offlineDetails")} onClick={showOffline}>
          <span className="header-indicator__circle">
            <WifiOffIcon width={17} height={17} />
          </span>
        </button>
      )}
      {syncOn &&
        (status === "up-to-date" ? (
          <Link to={SYNC_SETTINGS_PATH} className="header-indicator sync-pill--up-to-date" aria-label={t("sync.pill.aria", { status: label })}>
            <span className="header-indicator__circle">
              <CloudIcon width={17} height={17} />
            </span>
          </Link>
        ) : (
          <Link to={SYNC_SETTINGS_PATH} className={`header-indicator header-indicator--worded sync-pill--${status}`} aria-label={t("sync.pill.aria", { status: label })}>
            <span className="header-indicator__pill">
              <CloudIcon width={14} height={14} />
              <span aria-hidden="true">{label}</span>
            </span>
          </Link>
        ))}
    </span>
  );
}

/**
 * Desktop: pills at the bottom of the sidebar, above the fan-made notice
 * (WebSetList mockup, "synchro" and "reseau" tweaks). The sync pill always
 * shows its label there and opens Settings; without network, an "Hors-ligne"
 * pill comes first, even while the sync is off, and a click on it shows the
 * offline toast. Resuming a paused sync goes through the banner.
 */
export function SidebarPills() {
  const { status, pendingChanges } = useSync();
  const online = useOnline();
  const showOffline = useShowOfflineNotice();
  const { t } = useI18n();
  const syncOn = status !== "disabled";
  if (online && !syncOn) return null;
  const label = syncPillLabel(t, status, pendingChanges);
  return (
    <div className="sidebar-pills" role="status">
      {!online && (
        <button type="button" className="sidebar-pill sidebar-pill--offline" aria-label={t("status.offlineDetails")} onClick={showOffline}>
          <WifiOffIcon width={14} height={14} />
          {t("status.offline")}
        </button>
      )}
      {syncOn && (
        <Link to={SYNC_SETTINGS_PATH} className={`sidebar-pill sync-pill--${status}`} aria-label={t("sync.pill.aria", { status: label })}>
          <CloudIcon width={14} height={14} />
          <span aria-hidden="true">{label}</span>
        </Link>
      )}
    </div>
  );
}

/** Paused: banner at the top of the page, the only banner of the app (it asks for an action). */
export function SyncPauseBanner({ variant }: { variant: "device" | "browser" }) {
  const { status, resume } = useSync();
  const { t } = useI18n();
  if (status !== "paused") return null;
  return (
    <div role="status" className="page-banner sync-banner">
      <span className="sync-banner__text">{t(`sync.banner.${variant}` as MessageKey)}</span>
      <button type="button" className="sync-banner__button" onClick={() => void resume()}>
        {t("sync.resumeShort")}
      </button>
    </div>
  );
}
