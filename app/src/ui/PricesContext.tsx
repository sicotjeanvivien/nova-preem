import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useI18n } from "../i18n/i18n.tsx";
import { arePricesOld, downloadPrices, isPriceRefreshDue, type PriceMap } from "../domain/prices.ts";
import type { StoredPrices } from "../domain/stores.ts";
import { useApp } from "./AppContext.tsx";

/** The prices the screens show, when the feature is on and some prices are known. */
export interface PricesInfo {
  prices: PriceMap;
  /** Date of the Cardmarket prices (ISO). */
  sourceDate: string;
  /** More than 7 days old: shown as "Prix anciens". */
  old: boolean;
}

const PricesContext = createContext<PricesInfo | null>(null);

/**
 * Indicative prices (docs/prices-spec.md §5): the last prices downloaded are used
 * at once, offline included; at launch, when online, they are downloaded again if
 * they are more than 12 hours old. Nothing at all when the build has no prices
 * URL or when the "Prix indicatifs" setting is off (no download either).
 */
export function PricesProvider({ children }: { children: ReactNode }) {
  const { services, settings } = useApp();
  const priceServices = services.prices;
  const enabled = priceServices !== null && settings.indicativePrices;
  const [stored, setStored] = useState<StoredPrices | undefined>(undefined);

  useEffect(() => {
    if (!enabled || !priceServices) return;
    let cancelled = false;
    void (async () => {
      const current = await priceServices.store.load();
      if (cancelled) return;
      setStored(current);
      if (!navigator.onLine || !isPriceRefreshDue(current, new Date())) return;
      try {
        const next = await downloadPrices(priceServices, new Date());
        if (!cancelled) setStored(next);
      } catch (error) {
        // The last prices known stay in use.
        console.warn("Prices download failed", error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, priceServices]);

  const value = useMemo<PricesInfo | null>(
    () => (enabled && stored ? { prices: stored.file.prices, sourceDate: stored.file.sourceDate, old: arePricesOld(stored.file, new Date()) } : null),
    [enabled, stored],
  );
  return <PricesContext.Provider value={value}>{children}</PricesContext.Provider>;
}

/** The prices to show, or null: feature absent, setting off, or no prices yet. */
export function usePrices(): PricesInfo | null {
  return useContext(PricesContext);
}

/** "17/11" (French) or "11/17" (English): the date of the prices. */
export function formatPriceDate(sourceDate: string, language: string): string {
  return new Intl.DateTimeFormat(language, { day: "2-digit", month: "2-digit" }).format(new Date(sourceDate));
}

/**
 * "Prix du 17/11", or "Prix anciens · 09/11" in amber when the prices are more
 * than 7 days old (spec §5). `lowercase`: "prix du 17/11", inside a sentence.
 */
export function PriceDate({ prices, lowercase = false }: { prices: PricesInfo; lowercase?: boolean }) {
  const { t, language } = useI18n();
  const date = formatPriceDate(prices.sourceDate, language);
  if (prices.old) return <span className="prices-old">{t("prices.dateOld", { date })}</span>;
  return <>{lowercase ? t("settings.pricesDate", { date }) : t("prices.date", { date })}</>;
}

/** "Prix indicatifs Cardmarket, toutes langues confondues · 17/11" (card page, spec §5); the date in amber when old. */
export function PriceSource({ prices }: { prices: PricesInfo }) {
  const { t, language } = useI18n();
  const date = formatPriceDate(prices.sourceDate, language);
  return (
    <p className="price-source">
      {t("prices.source")} · {prices.old ? <span className="prices-old">{t("prices.dateOld", { date })}</span> : date}
    </p>
  );
}
