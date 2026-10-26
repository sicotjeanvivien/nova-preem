import { useAppShellCached, useOnline } from "../platform/connectivity.ts";
import { useI18n } from "../i18n/i18n.tsx";

/**
 * Offline indicator of the mockups: "Hors-ligne prêt" once the app and its
 * catalog are available without network, "Hors-ligne" when the network is down.
 */
export function useOfflineStatus(): "offline" | "ready" | null {
  const online = useOnline();
  const cached = useAppShellCached();
  if (!online) return "offline";
  return cached ? "ready" : null;
}

export function StatusPill() {
  const { t } = useI18n();
  const status = useOfflineStatus();
  if (!status) return null;
  return (
    <span className={`status-pill ${status === "offline" ? "status--offline" : ""}`} role="status">
      <span className="status-dot" />
      {t(status === "offline" ? "status.offline" : "status.offlineReady")}
    </span>
  );
}

export function StatusText() {
  const { t } = useI18n();
  const status = useOfflineStatus();
  if (!status) return null;
  return (
    <span className={`status ${status === "offline" ? "status--offline" : ""}`} role="status">
      <span className="status-dot" />
      {t(status === "offline" ? "status.offline" : "status.offlineReady")}
    </span>
  );
}
