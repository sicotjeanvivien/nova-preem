import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { diffCatalogs, type CatalogDiff } from "../domain/catalogDiff.ts";
import { checkCatalogUpdate, fetchCatalog, type CatalogCheck } from "../domain/catalogLoader.ts";
import type { StoredCatalog } from "../domain/stores.ts";
import { localize } from "../domain/catalog.ts";
import { useI18n } from "../i18n/i18n.tsx";
import { downloadImages } from "../platform/imageDownload.ts";
import { useApp } from "./AppContext.tsx";

interface PendingUpdate {
  stored: StoredCatalog;
  diff: CatalogDiff;
}

interface CatalogUpdateValue {
  /** A newer catalog, downloaded and checked, waiting for the user's choice. */
  pending: PendingUpdate | null;
  /** Compares the remote manifest with the stored one; downloads the new catalog if any (spec §6). */
  check(): Promise<CatalogCheck>;
  apply(): Promise<void>;
  /** "Plus tard": asked again at the next launch or check. */
  dismiss(): void;
}

const CatalogUpdateContext = createContext<CatalogUpdateValue | null>(null);

/**
 * Catalog updates (spec §6, States 3): checked at each launch when online.
 * The collection is never modified: it references printings by identifier.
 */
export function CatalogUpdateProvider({
  onUpdated,
  checkAtLaunch,
  children,
}: {
  onUpdated: (stored: StoredCatalog) => void;
  checkAtLaunch: boolean;
  children: ReactNode;
}) {
  const { services, catalog, settings } = useApp();
  const [pending, setPending] = useState<PendingUpdate | null>(null);
  const current = useRef(catalog);
  current.current = catalog;

  const check = useCallback(async (): Promise<CatalogCheck> => {
    const result = await checkCatalogUpdate(services.catalog.source, current.current.manifest);
    if (result.status !== "available") return result;
    try {
      const stored = await fetchCatalog(services.catalog);
      setPending({ stored, diff: diffCatalogs(current.current.catalog, stored.catalog) });
      return result;
    } catch (error) {
      console.error("Catalog update download failed", error);
      return { status: "error" };
    }
  }, [services]);

  const apply = useCallback(async () => {
    if (!pending) return;
    await services.catalog.store.save(pending.stored);
    setPending(null);
    onUpdated(pending.stored);
    if (settings.downloadAllImages) {
      // The images of the new printings join those already downloaded (spec §7).
      const urls = pending.stored.catalog.printings.flatMap((printing) =>
        printing.image ? [new URL(printing.image.thumbPath, services.imageBaseUrl).href, new URL(printing.image.path, services.imageBaseUrl).href] : [],
      );
      void downloadImages(urls);
    }
  }, [pending, services, onUpdated, settings.downloadAllImages]);

  const dismiss = useCallback(() => setPending(null), []);

  const checked = useRef(false);
  useEffect(() => {
    if (!checkAtLaunch || checked.current) return;
    checked.current = true;
    void check().catch(() => {});
  }, [check, checkAtLaunch]);

  const value = useMemo(() => ({ pending, check, apply, dismiss }), [pending, check, apply, dismiss]);
  return <CatalogUpdateContext.Provider value={value}>{children}</CatalogUpdateContext.Provider>;
}

export function useCatalogUpdate(): CatalogUpdateValue {
  const value = useContext(CatalogUpdateContext);
  if (!value) throw new Error("useCatalogUpdate must be used inside CatalogUpdateProvider");
  return value;
}

/** "Catalogue mis à jour" (States 3 / WebStates 3): bottom sheet on mobile, centered on desktop. */
export function CatalogUpdateDialog() {
  const { pending, apply, dismiss } = useCatalogUpdate();
  const { catalog } = useApp();
  const { t, language } = useI18n();
  const laterButton = useRef<HTMLButtonElement>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!pending) return;
    laterButton.current?.focus();
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && dismiss();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [pending, dismiss]);

  if (!pending) return null;
  const { diff } = pending;
  const releases = diff.newReleases.map((release) => localize(release.name, language)).join(", ");
  const items = [
    diff.newCards > 0 && t("update.newCards", { count: diff.newCards }),
    diff.newPrintings > 0 && (releases ? t("update.newPrintingsIn", { count: diff.newPrintings, releases }) : t("update.newPrintings", { count: diff.newPrintings })),
    diff.correctedTexts > 0 && t("update.correctedTexts", { count: diff.correctedTexts }),
  ].filter((item): item is string => typeof item === "string");

  return (
    <div className="dialog-backdrop" onClick={(event) => event.target === event.currentTarget && dismiss()}>
      <section role="dialog" aria-modal="true" aria-labelledby="update-title" className="dialog">
        <h2 id="update-title" className="dialog__title">
          {t("update.title")}
        </h2>
        <span className="dialog__meta">{t("update.versions", { from: catalog.manifest.version, to: pending.stored.manifest.version })}</span>
        <ul className="dialog__list">{items.length > 0 ? items.map((item) => <li key={item}>{item}</li>) : <li>{t("update.minor")}</li>}</ul>
        <p className="dialog__text">{t("update.collectionSafe")}</p>
        <div className="dialog__actions">
          <button ref={laterButton} type="button" className="button button--secondary" onClick={dismiss}>
            {t("update.later")}
          </button>
          <button
            type="button"
            className="button button--primary"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void apply().finally(() => setBusy(false));
            }}
          >
            {t("update.apply")}
          </button>
        </div>
      </section>
    </div>
  );
}
