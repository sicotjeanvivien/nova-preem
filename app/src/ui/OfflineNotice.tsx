import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useI18n } from "../i18n/i18n.tsx";
import { useAppShellCached, useOnline } from "../platform/connectivity.ts";
import { useIsDesktop } from "../platform/media.ts";
import { useApp } from "./AppContext.tsx";
import { WifiOffIcon } from "./icons.tsx";

// Offline (docs/app-spec.md §8, revised 2026-11-02): no banner and no permanent
// indicator, only toasts. "Works offline now" once per device; "Offline…" when
// the network goes (or the app opens without it) and on each tap of the
// offline icon (mobile header) or pill (desktop sidebar). They go away by themselves.

/** How long a toast stays (same as the entry toast). */
const NOTICE_DURATION_MS = 5000;

type NoticeKind = "offline" | "ready";

const ShowOfflineNotice = createContext<() => void>(() => {});

/** Shows the offline toast: for the offline icon and pill. */
export function useShowOfflineNotice(): () => void {
  return useContext(ShowOfflineNotice);
}

export function OfflineNoticeProvider({ children }: { children: ReactNode }) {
  const online = useOnline();
  const cached = useAppShellCached();
  const { settings, updateSettings } = useApp();
  const [notice, setNotice] = useState<{ id: number; kind: NoticeKind } | null>(null);
  const nextId = useRef(0);
  const show = useCallback((kind: NoticeKind) => setNotice({ id: ++nextId.current, kind }), []);
  const showOffline = useCallback(() => show("offline"), [show]);

  useEffect(() => {
    if (!online) show("offline");
    else setNotice((current) => (current?.kind === "offline" ? null : current));
  }, [online, show]);

  const readyNotified = settings.offlineReadyNotified;
  useEffect(() => {
    if (!cached || !online || readyNotified) return;
    show("ready");
    updateSettings({ offlineReadyNotified: true });
  }, [cached, online, readyNotified, show, updateSettings]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), NOTICE_DURATION_MS);
    return () => clearTimeout(timer);
  }, [notice]);

  return (
    <ShowOfflineNotice.Provider value={showOffline}>
      {children}
      {notice && <OfflineToast key={notice.id} kind={notice.kind} />}
    </ShowOfflineNotice.Provider>
  );
}

function OfflineToast({ kind }: { kind: NoticeKind }) {
  const { t } = useI18n();
  const isDesktop = useIsDesktop();
  const text = kind === "ready" ? t("offline.ready") : t(isDesktop ? "offline.browser" : "offline.device");
  return (
    <div role="status" className={`offline-toast offline-toast--${kind}`}>
      <WifiOffIcon width={18} height={18} />
      <span className="offline-toast__text">{text}</span>
    </div>
  );
}
