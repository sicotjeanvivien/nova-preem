import { Link } from "react-router";
import { useI18n } from "../i18n/i18n.tsx";
import type { MessageKey } from "../i18n/messages.ts";
import { CloudIcon } from "./icons.tsx";
import { syncPillLabel } from "./SyncCard.tsx";
import { useSync } from "./SyncContext.tsx";

// Sync status outside Settings (docs/sync-spec.md §8, element 4; SyncIndicators mockup).
// Nothing at all while the sync is off.

/** Where the indicators lead: Settings → Data, on the sync card. */
export const SYNC_SETTINGS_PATH = "/reglages#sync";

/**
 * Mobile: pill on the right of each tab's header. Up to date: the icon only
 * (the label is for screen readers); the other states add a word. Opens Settings.
 */
export function SyncPill() {
  const { status, pendingChanges } = useSync();
  const { t } = useI18n();
  if (status === "disabled") return null;
  const label = syncPillLabel(t, status, pendingChanges);
  return (
    <Link to={SYNC_SETTINGS_PATH} className={`sync-pill sync-pill--header sync-pill--${status}`} aria-label={t("sync.pill.aria", { status: label })}>
      <CloudIcon width={14} height={14} />
      {status !== "up-to-date" && <span aria-hidden="true">{label}</span>}
    </Link>
  );
}

/** Desktop: a line under "Hors-ligne prêt" in the sidebar, and the resume button while paused. */
export function SyncSidebarLine() {
  const { status, pendingChanges, resume } = useSync();
  const { t } = useI18n();
  if (status === "disabled") return null;
  return (
    <>
      <Link to={SYNC_SETTINGS_PATH} className={`sync-line sync-line--${status}`}>
        <CloudIcon width={14} height={14} />
        {t("sync.sidebar", { status: syncPillLabel(t, status, pendingChanges) })}
      </Link>
      {status === "paused" && (
        <button type="button" className="sync-resume-button" onClick={() => void resume()}>
          {t("sync.resume")}
        </button>
      )}
    </>
  );
}

/** Paused: banner at the top of the page, like the offline one (which comes first when both show). */
export function SyncPauseBanner({ variant }: { variant: "device" | "browser" }) {
  const { status, resume } = useSync();
  const { t } = useI18n();
  if (status !== "paused") return null;
  return (
    <div role="status" className="offline-banner sync-banner">
      <span className="sync-banner__text">{t(`sync.banner.${variant}` as MessageKey)}</span>
      <button type="button" className="sync-banner__button" onClick={() => void resume()}>
        {t("sync.resumeShort")}
      </button>
    </div>
  );
}
