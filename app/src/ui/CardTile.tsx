import { useState } from "react";
import { Link, useLocation } from "react-router";
import { isVariantOwnedIn, quantityOf, type Quantities, type Variant } from "../domain/variants.ts";
import { useI18n } from "../i18n/i18n.tsx";
import { useApp } from "./AppContext.tsx";
import { cardLinkState } from "./cardLink.ts";
import { CardPlaceholderIcon } from "./icons.tsx";
import { cardColor, languageLabel, rarityColor, rarityShort } from "./labels.ts";

interface CardTileProps {
  variant: Variant;
  /** Language of the quantities of the page. */
  language: string;
  name: string;
  quantities: Quantities;
  onChange: (delta: number) => void;
}

/**
 * A card of a release (SetGrid / WebSets, spec §5.1): the image and the name
 * open the card page; − quantity + below change the copies in the page's
 * language. A badge shows the copies owned in the other language.
 */
export function CardTile({ variant, language, name, quantities, onChange }: CardTileProps) {
  const { t } = useI18n();
  const { services } = useApp();
  const location = useLocation();
  const [imageFailed, setImageFailed] = useState(false);

  const printing = variant.printings.get(language);
  const quantity = quantityOf(quantities, printing);
  const owned = isVariantOwnedIn(variant, quantities, language);
  const shown = printing ?? [...variant.printings.values()][0];
  const thumb = shown?.image && !imageFailed ? new URL(shown.image.thumbPath, services.imageBaseUrl).href : null;
  const others = [...variant.printings]
    .filter(([code]) => code !== language)
    .map(([code, p]) => ({ code, quantity: quantityOf(quantities, p) }))
    .filter((other) => other.quantity > 0);
  const params = { language: languageLabel(t, language), name };

  return (
    <div className={`tile ${owned ? "" : "tile--missing"}`}>
      <Link
        to={`/cartes/${variant.card.slug}`}
        state={cardLinkState(location, variant.key, language)}
        className="tile__open-area"
        aria-label={t("cards.open", { name, number: variant.collectorNumber })}
      >
        <span className="tile__stripe" style={{ background: cardColor(variant.card.color) }} />
        <span className="tile__image">
          {thumb ? (
            <img src={thumb} alt="" loading="lazy" decoding="async" onError={() => setImageFailed(true)} />
          ) : (
            <span className="tile__placeholder">
              <CardPlaceholderIcon width={26} height={26} />
              {imageFailed && <span className="tile__placeholder-text">{t("tile.imageMissing")}</span>}
            </span>
          )}
          <span className="tile__number">{variant.collectorNumber}</span>
          <span className="tile__rarity" style={{ background: rarityColor(variant.rarity) }}>
            {rarityShort(t, variant.rarity)}
          </span>
          {others.map((other) => (
            <span key={other.code} className={`tile__other quantity-badge quantity-badge--${other.code}`}>
              {languageLabel(t, other.code)} {other.quantity}
            </span>
          ))}
        </span>
        <span className="tile__name">{name}</span>
      </Link>
      {printing && (
        <div className="tile__stepper">
          <button type="button" aria-label={t("cards.remove", params)} disabled={quantity === 0} onClick={() => onChange(-1)}>
            −
          </button>
          <span className={`tile__quantity ${quantity === 0 ? "tile__quantity--zero" : ""}`} aria-live="polite">
            {quantity}
          </span>
          <button type="button" className="tile__plus" aria-label={t("cards.add", params)} onClick={() => onChange(1)}>
            +
          </button>
        </div>
      )}
    </div>
  );
}
