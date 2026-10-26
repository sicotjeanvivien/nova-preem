import { useMemo, useState } from "react";
import { Navigate, useLocation, useNavigate, useParams, useSearchParams } from "react-router";
import { localize, type Printing } from "../../domain/catalog.ts";
import { copiesOwned, defaultPrinting, exclusiveCounterpart, printingsOfVariants, splitCardName, variantsOfCard } from "../../domain/cardView.ts";
import { computeReleaseView, neighbors } from "../../domain/releaseView.ts";
import { releaseShortName } from "../../domain/setTabs.ts";
import { quantityOf, type Variant } from "../../domain/variants.ts";
import { useI18n } from "../../i18n/i18n.tsx";
import { useApp } from "../AppContext.tsx";
import { cardLinkState, readCardLinkState } from "../cardLink.ts";
import { useCollection } from "../CollectionContext.tsx";
import { CardPlaceholderIcon, ChevronLeftIcon, ChevronRightIcon } from "../icons.tsx";
import { cardColor, cardColorLabel, cardColorText, cardTypeLabel, languageLabel, languageName, rarityColor } from "../labels.ts";
import { useDocumentTitle } from "./useDocumentTitle.ts";

/** The cards of a release (Sets, level 3): the only origin with previous / next. */
const RELEASE_CARDS = /^\/sets\/([^/]+)\/([^/]+)$/;

/**
 * Card page (CardDetail / WebCard, docs/app-spec.md §5.9): one page per card,
 * whatever screen it is opened from. The back button returns to that screen
 * in the same state; previous / next browse the set page it came from.
 */
export function CardScreen() {
  const { slug = "" } = useParams();
  const { index, settings, services } = useApp();
  const { quantities, change } = useCollection();
  const { t, language: uiLanguage } = useI18n();
  const location = useLocation();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const linkState = readCardLinkState(location.state);

  const card = index.cardsBySlug.get(slug);
  const variants = useMemo(() => (card ? variantsOfCard(index, card) : []), [index, card]);

  // Display language: from the URL, else the language of the screen of origin, else the settings.
  const nameLanguages = card ? index.catalog.languages.filter((code) => card.name[code]) : [];
  const preferred = [params.get("langue"), linkState?.language, settings.cardNameLanguage === "entry" ? settings.entryLanguage : settings.cardNameLanguage];
  const language = preferred.find((code): code is string => !!code && nameLanguages.includes(code)) ?? "en";
  // Printings in the display language first (VF then VO in French, as in the mockups).
  const languageOrder = [language, ...index.catalog.languages.filter((code) => code !== language)];
  const printings = printingsOfVariants(variants, languageOrder);

  const selected =
    printings.find((printing) => printing.id === params.get("impression")) ??
    defaultPrinting(variants, { variantKey: linkState?.variantKey ?? null, language: linkState?.language ?? null }, language);

  const name = card ? localize(card.name, language) : "";
  useDocumentTitle(name);
  if (!card || !selected) return <Navigate to="/sets" replace />;

  const setName = (id: string | undefined) => localize(index.sets.get(id ?? "")?.name ?? {}, uiLanguage);
  const releaseLabel = (variant: Pick<Variant, "release">) => releaseShortName(localize(variant.release.name, uiLanguage), setName(variant.release.setId));
  const variantOf = (printing: Printing) => variants.find((variant) => variant.key === printing.variantKey)!;

  // Screen of origin: the cards of a release (with their filter and language), Collection, Search,
  // or none (direct link: back goes up one level, to the cards of the release of the printing shown).
  const fromRelease = linkState ? RELEASE_CARDS.exec(linkState.from.pathname) : null;
  const originParams = new URLSearchParams(linkState?.from.search ?? "");
  const releaseView = fromRelease
    ? computeReleaseView(
        index,
        decodeURIComponent(fromRelease[1]!),
        decodeURIComponent(fromRelease[2]!),
        { filtre: originParams.get("filtre"), langue: originParams.get("langue") },
        settings,
        quantities,
      )
    : null;
  const selectedRelease = index.releases.get(selected.releaseId)!;
  const backLabel = releaseView
    ? `${setName(releaseView.set.id)} · ${releaseLabel(releaseView)}`
    : linkState?.from.pathname === "/collection"
      ? t("nav.collection")
      : linkState?.from.pathname === "/recherche"
        ? t("nav.search")
        : `${setName(selectedRelease.setId)} · ${releaseLabel({ release: selectedRelease })}`;
  const goBack = () => (linkState ? navigate(-1) : navigate(`/sets/${selectedRelease.setId}/${selectedRelease.id}`));

  const around = releaseView && linkState?.variantKey ? neighbors(releaseView, linkState.variantKey) : { previous: null, next: null };
  const openNeighbor = (variant: Variant) =>
    navigate(`/cartes/${variant.card.slug}`, { replace: true, state: cardLinkState(linkState!.from, variant.key, releaseView!.language) });

  const setParam = (changes: Record<string, string>) =>
    setParams((current) => ({ ...Object.fromEntries(current), ...changes }), { replace: true, state: location.state });
  const chooseLanguage = (code: string) => {
    const sibling = variantOf(selected).printings.get(code);
    setParam({ langue: code, ...(sibling && { impression: sibling.id }) });
  };

  const { title, subtitle } = splitCardName(name, card.baseName[language]);
  const otherLanguage = nameLanguages.find((code) => code !== language);
  const rulesLanguage = card.rulesText[language] !== undefined ? language : "en";
  // The text printed on the selected printing when it differs (Iconic arts…), else the card's text (spec §5.9).
  const printedText = selected.language === rulesLanguage ? selected.printedRulesText : undefined;
  const rulesText = printedText ?? card.rulesText[rulesLanguage] ?? null;
  const stats = [
    card.cost !== null && t("card.cost", { value: card.cost }),
    card.power !== null && t("card.power", { value: card.power }),
    card.ram !== null && t("card.ram", { value: card.ram }),
  ].filter((stat): stat is string => typeof stat === "string");

  const printingLabel = (printing: Printing) => ({
    release: releaseLabel(variantOf(printing)),
    number: printing.collectorNumber,
    language: languageLabel(t, printing.language),
  });
  const neighborName = (variant: Variant) => {
    const full = localize(variant.card.name, language);
    return { full, short: splitCardName(full, variant.card.baseName[language]).title };
  };

  const languageToggle = nameLanguages.length > 1 && (
    <div role="group" aria-label={t("card.displayLanguage")} className="segmented">
      {nameLanguages.map((code) => (
        <button key={code} type="button" aria-pressed={code === language} className={`segmented__option segmented__option--${code}`} onClick={() => chooseLanguage(code)}>
          {languageLabel(t, code)}
        </button>
      ))}
    </div>
  );

  const neighborLink = (variant: Variant | null, direction: "previous" | "next", className: string) => {
    if (!variant) return <span className={`${className} ${className}--empty`} />;
    const { full, short } = neighborName(variant);
    return (
      <button
        type="button"
        className={`${className} ${className}--${direction}`}
        aria-label={t(direction === "previous" ? "card.previous" : "card.next", { number: variant.collectorNumber, name: full })}
        onClick={() => openNeighbor(variant)}
      >
        {direction === "previous" && <ChevronLeftIcon width={16} height={16} />}
        {direction === "previous" && <span className="neighbor__number">{variant.collectorNumber}</span>}
        <span className="neighbor__name">{short}</span>
        {direction === "next" && <span className="neighbor__number">{variant.collectorNumber}</span>}
        {direction === "next" && <ChevronRightIcon width={16} height={16} />}
      </button>
    );
  };
  const hasNeighbors = Boolean(around.previous || around.next);

  const artists = new Map<string, string[]>();
  for (const variant of variants) {
    const names = new Set([...variant.printings.values()].map((printing) => printing.artist ?? t("card.unknownArtist")));
    for (const artist of names) artists.set(artist, [...(artists.get(artist) ?? []), `${releaseLabel(variant)} #${variant.collectorNumber}`]);
  }

  return (
    <div className="card-page">
      <header className="card-header mobile-only">
        <button type="button" className="icon-button" aria-label={t("card.backAria", { label: backLabel })} onClick={goBack}>
          <ChevronLeftIcon width={22} height={22} />
        </button>
        <span className="card-header__back">
          <span className="card-header__back-hint">{t("card.backTo")}</span>
          <span className="card-header__back-label">{backLabel}</span>
        </span>
        {languageToggle}
      </header>
      {hasNeighbors && (
        <nav aria-label={t("card.setNavigation")} className="card-neighbors mobile-only">
          {neighborLink(around.previous, "previous", "card-neighbors__link")}
          {neighborLink(around.next, "next", "card-neighbors__link")}
        </nav>
      )}

      <div className="card-topbar desktop-only">
        <button type="button" className="card-topbar__back" onClick={goBack}>
          <ChevronLeftIcon width={18} height={18} />
          {backLabel}
        </button>
        {hasNeighbors && (
          <nav aria-label={t("card.setNavigation")} className="card-topbar__neighbors">
            {neighborLink(around.previous, "previous", "neighbor-button")}
            {neighborLink(around.next, "next", "neighbor-button")}
          </nav>
        )}
      </div>

      <div className="card-layout">
        <div className="card-media">
          <CardImage
            printing={selected}
            color={card.color}
            baseUrl={services.imageBaseUrl}
            alt={t("card.imageAlt", { name, ...printingLabel(selected) })}
            missing={t("card.imageMissing", printingLabel(selected))}
          />
          <div role="group" aria-label={t("card.shownPrinting")} className="card-thumbs">
            {printings.map((printing) => (
              <button
                key={printing.id}
                type="button"
                aria-pressed={printing.id === selected.id}
                aria-label={t("card.showPrinting", printingLabel(printing))}
                className="card-thumb"
                onClick={() => setParam({ impression: printing.id })}
              >
                <span className="card-thumb__image">
                  {printing.image && <img src={new URL(printing.image.thumbPath, services.imageBaseUrl).href} alt="" loading="lazy" decoding="async" />}
                </span>
                <span className="card-thumb__label">
                  {printing.collectorNumber} {languageLabel(t, printing.language)}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="card-info">
          <div className="card-heading">
            <div className="card-heading__names">
              <h1 className="card-heading__title">{title}</h1>
              {subtitle && <span className="card-heading__subtitle">{subtitle}</span>}
              {otherLanguage && (
                <span className="card-heading__other">
                  {t("card.otherName", { language: languageLabel(t, otherLanguage), name: localize(card.name, otherLanguage) })}
                </span>
              )}
            </div>
            <div className="desktop-only">{languageToggle}</div>
          </div>

          <div className="card-tags">
            <span className="tag">{cardTypeLabel(t, card.type)}</span>
            {card.color && (
              <span className="tag" style={{ borderColor: cardColor(card.color), color: cardColorText(card.color) }}>
                {cardColorLabel(t, card.color)}
              </span>
            )}
            {stats.map((stat) => (
              <span key={stat} className="tag tag--mono">
                {stat}
              </span>
            ))}
            {card.classifications.length > 0 && <span className="card-tags__classifications">{card.classifications.join(" · ")}</span>}
          </div>

          <section aria-labelledby="rules-title" className="rules">
            <h2 id="rules-title" className="rules__title">
              {t("card.rulesText", { language: languageLabel(t, rulesLanguage) })}
            </h2>
            <p className="rules__text">{rulesText ?? t("card.noRulesText")}</p>
          </section>

          <section aria-labelledby="printings-title" className="printings">
            <div className="printings__header">
              <h2 id="printings-title" className="printings__title">
                {t("card.printingsTitle")}
              </h2>
              <span className="printings__copies">{t("card.copies", { count: copiesOwned(printings, quantities) })}</span>
            </div>

            <div className="mobile-only printing-list">
              {variants.map((variant) => {
                const counterpart = exclusiveCounterpart(index, variant);
                const artistsOfVariant = [...new Set([...variant.printings.values()].map((p) => p.artist ?? t("card.unknownArtist")))];
                return (
                  <div key={variant.key} className="printing-card">
                    <div className="printing-card__header">
                      <div className="printing-card__titles">
                        <span className="printing-card__release">
                          {releaseLabel(variant)} <span className="printing-card__number">#{variant.collectorNumber}</span>
                          {counterpart && <span className="exclusive-chip">{t("card.exclusive", { release: releaseLabel(variant) })}</span>}
                        </span>
                        <span className="printing-card__artist">{t("card.illustration", { artist: artistsOfVariant.join(" / ") })}</span>
                      </div>
                      <RarityLabel variant={variant} />
                    </div>
                    {printingsOfVariants([variant], languageOrder).map((printing) => (
                      <div key={printing.id} className="printing-row">
                        <span className={`language-chip language-chip--${printing.language}`}>{languageLabel(t, printing.language)}</span>
                        <span className="printing-row__language">{languageName(t, printing.language)}</span>
                        <QuantityStepper printing={printing} labels={printingLabel(printing)} quantity={quantityOf(quantities, printing)} onChange={change} />
                      </div>
                    ))}
                    {counterpart && (
                      <p className="printing-card__note">
                        {t("card.exclusiveNote", { release: releaseLabel(variant), counterpart: releaseLabel({ release: counterpart }) })}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="desktop-only printing-table-wrapper">
              <table className="printing-table">
                <thead>
                  <tr>
                    <th scope="col">{t("card.column.release")}</th>
                    <th scope="col">{t("card.column.number")}</th>
                    <th scope="col">{t("card.column.rarity")}</th>
                    <th scope="col">{t("card.column.language")}</th>
                    <th scope="col" className="printing-table__quantity">
                      {t("card.column.quantity")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {variants.flatMap((variant) => {
                    const counterpart = exclusiveCounterpart(index, variant);
                    return printingsOfVariants([variant], languageOrder).map((printing) => (
                      <tr key={printing.id}>
                        <td>
                          {releaseLabel(variant)}
                          {counterpart && <span className="exclusive-chip">{t("card.exclusive", { release: releaseLabel(variant) })}</span>}
                        </td>
                        <td className="mono">{printing.collectorNumber}</td>
                        <td>
                          <RarityLabel variant={variant} />
                        </td>
                        <td>
                          <span className={`language-chip language-chip--${printing.language}`}>{languageLabel(t, printing.language)}</span>
                        </td>
                        <td>
                          <QuantityStepper printing={printing} labels={printingLabel(printing)} quantity={quantityOf(quantities, printing)} onChange={change} />
                        </td>
                      </tr>
                    ));
                  })}
                </tbody>
              </table>
            </div>
            <p className="desktop-only printings__artists">
              {t("card.illustrations", { list: [...artists].map(([artist, where]) => `${artist} (${where.join(", ")})`).join(", ") })}
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}

function CardImage({ printing, color, baseUrl, alt, missing }: { printing: Printing; color: string | null; baseUrl: string; alt: string; missing: string }) {
  const [failed, setFailed] = useState<string | null>(null);
  const src = printing.image && failed !== printing.id ? new URL(printing.image.path, baseUrl).href : null;
  return (
    <div className="card-image" style={{ borderTopColor: cardColor(color) }}>
      {src ? (
        <img src={src} alt={alt} width={printing.image?.width} height={printing.image?.height} onError={() => setFailed(printing.id)} />
      ) : (
        <span className="card-image__missing">
          <CardPlaceholderIcon width={28} height={28} />
          {missing}
        </span>
      )}
    </div>
  );
}

function RarityLabel({ variant }: { variant: Variant }) {
  const { language } = useI18n();
  return (
    <span className="rarity-label" style={{ background: rarityColor(variant.rarity) }}>
      {variant.rarity ? localize(variant.rarity.name, language) : "?"}
    </span>
  );
}

function QuantityStepper({
  printing,
  labels,
  quantity,
  onChange,
}: {
  printing: Printing;
  labels: { release: string; number: string; language: string };
  quantity: number;
  onChange: (printingId: string, delta: number) => unknown;
}) {
  const { t } = useI18n();
  return (
    <span className="stepper">
      <button type="button" className="stepper__button" aria-label={t("card.remove", labels)} disabled={quantity === 0} onClick={() => onChange(printing.id, -1)}>
        −
      </button>
      <span className="stepper__value" aria-live="polite">
        {quantity}
      </span>
      <button type="button" className="stepper__button" aria-label={t("card.add", labels)} onClick={() => onChange(printing.id, 1)}>
        +
      </button>
    </span>
  );
}
