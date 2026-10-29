import { useEffect, useRef, useState } from "react";
import type { SyncStatus } from "../domain/sync.ts";
import type { Translator } from "../i18n/i18n.tsx";
import { useI18n } from "../i18n/i18n.tsx";
import type { MessageKey } from "../i18n/messages.ts";
import { useOnline } from "../platform/connectivity.ts";
import { useIsDesktop } from "../platform/media.ts";
import { ExternalLinkIcon, SyncCloudIcon } from "./icons.tsx";
import { useSync } from "./SyncContext.tsx";

/** "il y a 2 min (19:43)", "hier à 21:14"… (SyncIndicators texts). */
export function formatSyncTime(t: Translator["t"], language: string, iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  const time = new Intl.DateTimeFormat(language, { hour: "2-digit", minute: "2-digit" }).format(date);
  const minutes = Math.floor((now.getTime() - date.getTime()) / 60_000);
  if (minutes < 1) return t("sync.when.justNow", { time });
  if (minutes < 60) return t("sync.when.minutes", { count: minutes, time });
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((day(now) - day(date)) / 86_400_000);
  if (days === 0) return t("sync.when.today", { time });
  if (days === 1) return t("sync.when.yesterday", { time });
  return t("sync.when.date", { date: new Intl.DateTimeFormat(language, { day: "numeric", month: "short" }).format(date), time });
}

/** Status pill label (SyncIndicators): "Synchronisé", "En attente · 3"… */
export function syncPillLabel(t: Translator["t"], status: SyncStatus, pendingChanges: number): string {
  return status === "pending" ? t("sync.pill.pending", { count: pendingChanges }) : t(`sync.pill.${status}` as MessageKey);
}

/**
 * "Synchronisation Google Drive" in Settings → Data (sync spec §8, screens 1
 * and 2; Settings / WebSettings mockups, "etat" tweak): presentation and
 * connection when off, then account, status, warnings and actions.
 */
export function SyncCard() {
  const sync = useSync();
  const { t, language } = useI18n();
  const isDesktop = useIsDesktop();
  const online = useOnline();
  const [confirming, setConfirming] = useState(false);
  const variant = isDesktop ? "browser" : "device";
  const { state, status, pendingChanges } = sync;
  const prepare = sync.prepare;

  // Google's library is loaded before the tap, or the browser would block its pop-up.
  useEffect(() => prepare(), [prepare]);

  const off = status === "disabled";
  const account = state?.account ?? t("sync.unknownAccount");
  const lastSync = state?.lastSyncAt ? formatSyncTime(t, language, state.lastSyncAt) : null;
  const detail = (() => {
    switch (status) {
      case "up-to-date":
        return lastSync ? t("sync.detail.lastSync", { when: lastSync }) : t("sync.detail.notYet");
      case "pending":
        return t(online ? "sync.detail.pending" : "sync.detail.pendingOffline", { count: pendingChanges });
      case "syncing":
        return t("sync.detail.syncing");
      case "paused":
        return t(isDesktop ? "sync.detail.pausedClick" : "sync.detail.pausedTap");
      case "error":
        if (state?.lastError === "invalid-file") return t(`sync.detail.invalid.${variant}`);
        return lastSync ? t("sync.detail.error", { when: lastSync }) : t("sync.detail.errorNever");
      default:
        return "";
    }
  })();
  const error = status === "error" && state?.lastError && state.lastError !== "revoked" ? t(`sync.error.${state.lastError}.${variant}` as MessageKey) : null;
  const notice =
    status === "up-to-date" && state?.notice
      ? state.notice.kind === "recreated"
        ? t(`sync.notice.recreated.${variant}`)
        : t("sync.notice.other-files", { count: state.notice.count })
      : null;

  const syncButton = status !== "paused" && (
    <button type="button" className="sync-card__button" disabled={status === "syncing"} onClick={() => void sync.syncNow()}>
      {status === "syncing" ? t("sync.status.syncing") : status === "error" ? t("sync.retry") : t("sync.syncNow")}
    </button>
  );
  const resumeButton = status === "paused" && (
    <button type="button" className="sync-card__button sync-card__button--resume" onClick={() => void sync.resume()}>
      {t("sync.resume")}
    </button>
  );
  const fileLink = sync.fileUrl && (
    <a className="sync-card__link" href={sync.fileUrl} target="_blank" rel="noopener noreferrer">
      {t("sync.viewFile")}
      <ExternalLinkIcon width={14} height={14} />
    </a>
  );
  const disconnectButton = (
    <button type="button" className="sync-card__disconnect" onClick={() => setConfirming(true)}>
      {t("sync.disconnect")}
    </button>
  );

  return (
    <section id="sync" aria-labelledby="sync-title" className={`sync-card sync-card--${status}`}>
      <div className="sync-card__header">
        <span className="sync-card__icon">
          <SyncCloudIcon width={20} height={20} />
        </span>
        <h3 id="sync-title" className="sync-card__title">
          {t("settings.sync")}
        </h3>
        {isDesktop && !off && <span className={`sync-pill sync-pill--${status}`}>{syncPillLabel(t, status, pendingChanges)}</span>}
      </div>

      {off ? (
        <div className="sync-card__body">
          {state?.lastError === "revoked" && (
            <p role="alert" className="sync-card__alert sync-card__alert--error">
              {t("sync.revoked")}
            </p>
          )}
          <p className="sync-card__intro">{t("sync.intro")}</p>
          <ul className="sync-card__points">
            <li>
              {t("sync.pointFileBefore")}
              <strong>{t("sync.pointFileStrong")}</strong>
              {t("sync.pointFileAfter")}
            </li>
            <li>{t("sync.pointAccess")}</li>
            <li>{t("sync.pointOptional")}</li>
          </ul>
          <button type="button" className="sync-card__connect" onClick={() => void sync.connect()}>
            {t("sync.connect")}
          </button>
        </div>
      ) : (
        <div className="sync-card__body">
          <div className="sync-card__account">
            <span className="sync-card__avatar" aria-hidden="true">
              {account.charAt(0).toUpperCase()}
            </span>
            {isDesktop ? (
              <>
                <span className="sync-card__account-text">
                  <span className="sync-card__muted">{t("sync.connectedAs")} </span>
                  {account}
                </span>
                {disconnectButton}
              </>
            ) : (
              <span className="sync-card__account-text sync-card__account-text--stacked">
                <span className="sync-card__muted sync-card__small">{t("sync.connectedAs")}</span>
                <span className="sync-card__email">{account}</span>
              </span>
            )}
          </div>

          <div role="status" className="sync-card__status">
            <span className={`sync-dot sync-dot--${status}`} />
            <span className="sync-card__status-text">
              <span className="sync-card__status-label">{t(`sync.status.${status}` as MessageKey)}</span>
              <span className="sync-card__detail">{detail}</span>
            </span>
          </div>

          {error && (
            <p role="alert" className="sync-card__alert sync-card__alert--error">
              {error}
            </p>
          )}
          {notice && <p className="sync-card__alert sync-card__alert--warning">{notice}</p>}

          {isDesktop ? (
            <div className="sync-card__actions">
              {resumeButton}
              {syncButton}
              {fileLink}
            </div>
          ) : (
            <>
              {resumeButton}
              {syncButton}
              <div className="sync-card__footer">
                {fileLink || <span />}
                {disconnectButton}
              </div>
            </>
          )}
        </div>
      )}

      {confirming && (
        <DisconnectDialog
          variant={variant}
          onCancel={() => setConfirming(false)}
          onConfirm={() => {
            setConfirming(false);
            void sync.disconnect();
          }}
        />
      )}
    </section>
  );
}

function DisconnectDialog({ variant, onCancel, onConfirm }: { variant: "device" | "browser"; onCancel: () => void; onConfirm: () => void }) {
  const { t } = useI18n();
  const cancelButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancelButton.current?.focus();
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onCancel();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div className="dialog-backdrop" onClick={(event) => event.target === event.currentTarget && onCancel()}>
      <section role="dialog" aria-modal="true" aria-labelledby="disconnect-title" className="dialog">
        <h2 id="disconnect-title" className="dialog__title">
          {t("sync.disconnectTitle")}
        </h2>
        <p className="dialog__body">{t(`sync.disconnectText.${variant}`)}</p>
        <div className="dialog__actions">
          <button ref={cancelButton} type="button" className="button button--secondary" onClick={onCancel}>
            {t("sync.cancel")}
          </button>
          <button type="button" className="button button--danger" onClick={onConfirm}>
            {t("sync.disconnect")}
          </button>
        </div>
      </section>
    </div>
  );
}
