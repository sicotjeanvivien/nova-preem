import { useState } from "react";
import { Link, useLocation } from "react-router";
import { isVariantOwnedIn, quantityOf, type Quantities, type Variant } from "../domain/variants.ts";
import { useI18n } from "../i18n/i18n.tsx";
import { useApp } from "./AppContext.tsx";
import { CardPlaceholderIcon, ChevronRightIcon } from "./icons.tsx";
import { cardColor, languageLabel, rarityColor, rarityShort } from "./labels.ts";

interface SetTileProps {
  variant: Variant;
  /** Entry language of the page. */
  language: string;
  name: string;
  /** Release name, shown when several releases are listed together. */
  releaseName: string | null;
  quantities: Quantities;
  removeMode: boolean;
  highlighted: boolean;
  onTap: () => void;
}

/**
 * A card of the set grid: the main button adds (or removes) one copy in the
 * entry language; the arrow opens the card page.
 */
export function SetTile({ variant, language, name, releaseName, quantities, removeMode, highlighted, onTap }: SetTileProps) {
  const { t } = useI18n();
  const { services } = useApp();
  const location = useLocation();
  const [imageFailed, setImageFailed] = useState(false);

  const owned = isVariantOwnedIn(variant, quantities, language);
  const printing = variant.printings.get(language) ?? [...variant.printings.values()][0];
  const thumb = printing?.image && !imageFailed ? new URL(printing.image.thumbPath, services.imageBaseUrl).href : null;
  const badges = [...variant.printings]
    .map(([code, p]) => ({ code, quantity: quantityOf(quantities, p) }))
    .filter((badge) => badge.quantity > 0);
  const params = { language: languageLabel(t, language), name, number: variant.collectorNumber };

  return (
    <div className={`tile ${owned ? "" : "tile--missing"} ${highlighted ? "tile--highlighted" : ""}`}>
      <button type="button" className="tile__main" aria-label={t(removeMode ? "tile.remove" : "tile.add", params)} onClick={onTap}>
        <span className="tile__stripe" style={{ background: cardColor(variant.card.color) }} />
        <span className="tile__image">
          {thumb ? (
            <img src={thumb} alt="" loading="lazy" decoding="async" onError={() => setImageFailed(true)} />
          ) : (
            <CardPlaceholderIcon width={26} height={26} className="tile__placeholder" />
          )}
          <span className="tile__number">{variant.collectorNumber}</span>
          <span className="tile__rarity" style={{ background: rarityColor(variant.rarity) }}>
            {rarityShort(t, variant.rarity)}
          </span>
        </span>
        <span className="tile__name">{name}</span>
        {releaseName && <span className="tile__release">{releaseName}</span>}
      </button>
      <div className="tile__footer">
        <div className="tile__badges">
          {badges.map((badge) => (
            <span key={badge.code} className={`quantity-badge quantity-badge--${badge.code}`}>
              {languageLabel(t, badge.code)} {badge.quantity}
            </span>
          ))}
        </div>
        <Link to={`/cartes/${variant.card.slug}`} state={{ from: location }} className="tile__open" aria-label={t("tile.open", { name })}>
          <ChevronRightIcon width={18} height={18} />
        </Link>
      </div>
    </div>
  );
}
