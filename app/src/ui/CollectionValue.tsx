import type { MouseEvent } from "react";
import { Link, useLocation } from "react-router";
import { localize, type Printing } from "../domain/catalog.ts";
import { collectionValue, collectionValueByRelease, formatPrice, formatTotal, mostValuable } from "../domain/prices.ts";
import { releaseShortName } from "../domain/setTabs.ts";
import { useI18n } from "../i18n/i18n.tsx";
import type { MessageKey } from "../i18n/messages.ts";
import { useApp } from "./AppContext.tsx";
import { cardLinkState } from "./cardLink.ts";
import { useCollection } from "./CollectionContext.tsx";
import { languageLabel } from "./labels.ts";
import { PriceDate, type PricesInfo } from "./PricesContext.tsx";

/*
 * Estimated value of the collection, in Stats (Completion / WebStats, prices
 * spec §5): the total with the cards valued and without a price and the date of
 * the prices; the value by release (bars) and the five most expensive cards owned.
 */

const VALUE_SECTION = "valeur";

/** Bar colors of the mockups: Retail, the other main releases, starters, demo decks, promos. */
function barColor(group: string, first: boolean): string {
  if (group === "main") return first ? "var(--color-accent)" : "var(--color-rarity-epic)";
  return group === "starter" ? "var(--color-vo)" : group === "promo" ? "var(--color-vf)" : "var(--color-text-muted)";
}

function useCollectionValue(prices: PricesInfo) {
  const { index } = useApp();
  const { quantities } = useCollection();
  const { t, language } = useI18n();
  const value = collectionValue(quantities, index.printings, prices.prices);
  const setName = (setId: string) => localize(index.sets.get(setId)?.name ?? {}, language);
  const releaseName = (releaseId: string) => {
    const release = index.releases.get(releaseId)!;
    return releaseShortName(localize(release.name, language), setName(release.setId));
  };
  const byRelease = collectionValueByRelease(quantities, index.printings, index.releases, prices.prices);
  const max = Math.max(0, ...byRelease.map((row) => row.total));
  const rows = byRelease.map((row, position) => ({
    key: row.key,
    label: row.releaseId ? releaseName(row.releaseId) : t(`group.${row.group}` as MessageKey),
    value: formatTotal(row.total, language),
    percent: max > 0 ? Math.max(2, Math.round((row.total / max) * 100)) : 0,
    color: barColor(row.group, position === 0),
  }));
  const top = mostValuable(quantities, index.printings, prices.prices).map((item) => {
    const first: Printing = item.printings[0]!;
    const card = index.cards.get(first.cardId)!;
    const languages = [...new Set(item.printings.map((printing) => printing.language))];
    return {
      key: item.variantKey,
      card,
      printing: first,
      name: localize(card.name, first.language),
      meta: `${releaseName(first.releaseId)} #${first.collectorNumber} · ${languages.map((code) => languageLabel(t, code)).join(", ")}`,
      price: formatPrice(item.price, language),
    };
  });
  return { value, rows, top };
}

/** The value card at the top of Stats; on mobile, "Détail" leads to the detail below. */
export function CollectionValueCard({ prices, detailLink }: { prices: PricesInfo; detailLink: boolean }) {
  const { t, language } = useI18n();
  const { value } = useCollectionValue(prices);
  const goToDetail = (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    document.getElementById(VALUE_SECTION)?.scrollIntoView?.({ block: "start", behavior: "smooth" });
  };
  return (
    <section aria-labelledby="collection-value-title" className="value-card">
      <div className="value-card__figures">
        <h2 id="collection-value-title" className="value-card__title">
          {t("stats.value.title")}
        </h2>
        <span className="value-card__total">{formatTotal(value.total, language)}</span>
        <span className="value-card__meta">{t("stats.value.meta", { priced: value.priced, unpriced: value.unpriced })}</span>
        <span className="value-card__date">
          <PriceDate prices={prices} />
        </span>
        {!detailLink && <p className="value-card__note">{t("prices.note")}</p>}
      </div>
      {detailLink && (
        <a href={`#${VALUE_SECTION}`} className="secondary-button value-card__detail" onClick={goToDetail}>
          {t("stats.value.detail")}
        </a>
      )}
    </section>
  );
}

/** Value by release (bars) and the most expensive cards, each opening its card page. */
export function CollectionValueDetail({ prices, compact }: { prices: PricesInfo; compact: boolean }) {
  const { t } = useI18n();
  const location = useLocation();
  const { rows, top } = useCollectionValue(prices);
  const Heading = compact ? "h3" : "h2";
  return (
    <>
      <div className="value-detail__part">
        <Heading className="value-detail__title">{t(compact ? "stats.value.byReleaseShort" : "stats.value.byRelease")}</Heading>
        {rows.map((row) => (
          <div key={row.key} className="value-row">
            <span className="value-row__label">{row.label}</span>
            <span className="value-row__track" aria-hidden="true">
              <span className="value-row__bar" style={{ width: `${row.percent}%`, background: row.color }} />
            </span>
            <span className="value-row__value">{row.value}</span>
          </div>
        ))}
      </div>
      {top.length > 0 && (
        <div className="value-detail__part">
          <Heading className="value-detail__title">{t("stats.value.top")}</Heading>
          <ol className="value-top">
            {top.map((item, position) => (
              <li key={item.key}>
                <Link
                  to={`/cartes/${item.card.slug}`}
                  state={cardLinkState(location, item.key, item.printing.language)}
                  className="value-top__link"
                >
                  <span className="value-top__rank">{position + 1}</span>
                  <span className="value-top__names">
                    <span className="value-top__name">{item.name}</span>
                    <span className="value-top__meta">{item.meta}</span>
                  </span>
                  <span className="value-top__price">{item.price}</span>
                </Link>
              </li>
            ))}
          </ol>
        </div>
      )}
      {!compact && <p className="value-detail__note">{t("prices.note")}</p>}
    </>
  );
}

export const COLLECTION_VALUE_SECTION = VALUE_SECTION;
