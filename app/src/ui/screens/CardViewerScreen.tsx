import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { Navigate, useLocation, useNavigate, useParams, useSearchParams } from "react-router";
import { localize, type Printing } from "../../domain/catalog.ts";
import { printingsOfVariants, variantsOfCard } from "../../domain/cardView.ts";
import { releaseShortName } from "../../domain/setTabs.ts";
import { useI18n } from "../../i18n/i18n.tsx";
import { useApp } from "../AppContext.tsx";
import { aim, drag, flipTarget, initialMotion, KEY_STEP, lighting, recenterTarget, step, type Motion } from "../cardMotion.ts";
import { CardPlaceholderIcon, CloseIcon, FlipIcon, LogoIcon, RecenterIcon } from "../icons.tsx";
import { cardColor, languageLabel } from "../labels.ts";
import { useDocumentTitle } from "./useDocumentTitle.ts";

/** History state of a 3D view opened from the card page: closing it goes back there. */
export const FROM_CARD_PAGE = { fromCardPage: true };

const KEYS: Record<string, [number, number]> = { ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [1, 0], ArrowDown: [-1, 0] };

/**
 * 3D view of a card (CardViewer / WebCardViewer, docs/app-spec.md §5.10): the
 * card turns with a drag, a flip shows its back. Read only, full screen.
 */
export function CardViewerScreen() {
  const { slug = "" } = useParams();
  const { index, services } = useApp();
  const { t, language: uiLanguage } = useI18n();
  const location = useLocation();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();

  const card = index.cardsBySlug.get(slug);
  const variants = useMemo(() => (card ? variantsOfCard(index, card) : []), [index, card]);
  const chosen = variants.flatMap((variant) => [...variant.printings.values()]).find((printing) => printing.id === params.get("impression"));
  const requested = params.get("langue");
  const language = requested && card?.name[requested] ? requested : (chosen?.language ?? "en");
  // Same printings, same order as the thumbnails of the card page.
  const printings = printingsOfVariants(variants, [language, ...index.catalog.languages.filter((code) => code !== language)]);
  const selected = chosen ?? printings[0];

  const name = card ? localize(card.name, language) : "";
  useDocumentTitle(name);

  const [foil, setFoil] = useState(false);
  const [touched, setTouched] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const motion = useRef<Motion | null>(null);
  const pointer = useRef<{ x: number; y: number } | null>(null);

  // The pose is written to CSS variables, outside React: no render per frame.
  const paint = useCallback(() => {
    const element = cardRef.current;
    if (!element || !motion.current) return;
    const { pose } = motion.current;
    const light = lighting(pose);
    element.style.setProperty("--rx", `${pose.rx.toFixed(2)}deg`);
    element.style.setProperty("--ry", `${pose.ry.toFixed(2)}deg`);
    element.style.setProperty("--foil-position", `${light.foilX.toFixed(1)}% ${light.foilY.toFixed(1)}%`);
    element.style.setProperty("--foil-opacity", light.foilOpacity.toFixed(3));
    element.style.setProperty("--glare-position", `${light.glareX.toFixed(1)}% ${light.glareY.toFixed(1)}%`);
    element.style.setProperty("--glare-opacity", light.glareOpacity.toFixed(3));
  }, []);

  useEffect(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let last = performance.now();
    motion.current ??= initialMotion(last);
    paint();
    let frame = requestAnimationFrame(function tick(now) {
      frame = requestAnimationFrame(tick);
      const current = motion.current!;
      const next = pointer.current ? current : step(current, now - last, now, !reducedMotion.matches);
      last = now;
      if (next !== current) {
        motion.current = next;
        paint();
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [paint]);

  if (!card || !selected) return <Navigate to="/sets" replace />;

  const variantOf = (printing: Printing) => variants.find((variant) => variant.key === printing.variantKey)!;
  const labelParts = (printing: Printing) => {
    const release = variantOf(printing).release;
    const setName = localize(index.sets.get(release.setId)?.name ?? {}, uiLanguage);
    return { release: releaseShortName(localize(release.name, uiLanguage), setName), number: printing.collectorNumber, language: languageLabel(t, printing.language) };
  };
  const label = (printing: Printing) => Object.values(labelParts(printing)).join(" ");
  const chip = (printing: Printing) => `${printing.collectorNumber} ${languageLabel(t, printing.language)}`;

  const close = () =>
    location.state && (location.state as typeof FROM_CARD_PAGE).fromCardPage
      ? navigate(-1)
      : navigate(`/cartes/${card.slug}?impression=${selected.id}&langue=${language}`, { replace: true });
  const choose = (printing: Printing) =>
    setParams((current) => ({ ...Object.fromEntries(current), impression: printing.id }), { replace: true, state: location.state });
  const goTo = (target: (motion: Motion) => Motion) => {
    motion.current = target(motion.current ?? initialMotion(performance.now()));
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    pointer.current = { x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setTouched(true);
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!pointer.current || !motion.current) return;
    motion.current = drag(motion.current, event.clientX - pointer.current.x, event.clientY - pointer.current.y, performance.now());
    pointer.current = { x: event.clientX, y: event.clientY };
    paint();
  };
  const onPointerUp = () => {
    pointer.current = null;
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const key = KEYS[event.key];
    if (!key) return;
    event.preventDefault();
    setTouched(true);
    goTo((current) => {
      const from = current.target ?? current.pose;
      return aim(current, { rx: from.rx + key[0] * KEY_STEP, ry: from.ry + key[1] * KEY_STEP });
    });
  };

  const src = selected.image ? new URL(selected.image.path, services.imageBaseUrl).href : null;

  return (
    <div className="viewer">
      <header className="viewer__header">
        <button type="button" className="viewer__close" aria-label={t("viewer.close")} onClick={close}>
          <CloseIcon width={20} height={20} />
          <span className="desktop-only">{t("viewer.closeShort")}</span>
        </button>
        <span className="viewer__titles">
          <h1 className="viewer__name">{name}</h1>
          <span className="viewer__printing">{label(selected)}</span>
        </span>
      </header>

      <div
        className="viewer__stage"
        tabIndex={0}
        role="group"
        aria-label={t("viewer.stage", { name, printing: label(selected) })}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={onKeyDown}
      >
        <div className="viewer__shadow" />
        <div ref={cardRef} className={`viewer-card ${foil ? "viewer-card--foil" : ""}`}>
          <div className="viewer-card__face viewer-card__front">
            <CardFront key={selected.id} src={src} name={name} label={label(selected)} color={card.color} />
            <span className="viewer-card__foil" />
            <span className="viewer-card__glare" />
          </div>
          <div className="viewer-card__face viewer-card__back">
            <LogoIcon width={56} height={56} strokeWidth={1.2} />
            <span className="viewer-card__brand">{t("app.name")}</span>
          </div>
        </div>
        {!touched && <span className="viewer__hint">{t("viewer.hint")}</span>}
      </div>

      <div className="viewer__controls">
        <div role="group" aria-label={t("card.shownPrinting")} className="viewer__chips">
          {printings.map((printing) => (
            <button
              key={printing.id}
              type="button"
              className="viewer__chip"
              aria-pressed={printing.id === selected.id}
              aria-label={t("card.showPrinting", labelParts(printing))}
              onClick={() => choose(printing)}
            >
              {chip(printing)}
            </button>
          ))}
        </div>
        <div className="viewer__actions">
          <div role="group" aria-label={t("viewer.finish")} className="viewer__finish">
            <button type="button" aria-pressed={!foil} onClick={() => setFoil(false)}>
              {t("viewer.standard")}
            </button>
            <button type="button" aria-pressed={foil} onClick={() => setFoil(true)}>
              {t("viewer.foil")}
            </button>
          </div>
          <button type="button" className="viewer__action" aria-label={t("viewer.flip")} title={t("viewer.flip")} onClick={() => goTo((current) => aim(current, flipTarget(current.pose)))}>
            <FlipIcon width={20} height={20} />
            <span className="desktop-only">{t("viewer.flipShort")}</span>
          </button>
          <button type="button" className="viewer__action" aria-label={t("viewer.recenter")} title={t("viewer.recenter")} onClick={() => goTo((current) => aim(current, recenterTarget(current.pose)))}>
            <RecenterIcon width={20} height={20} />
            <span className="desktop-only">{t("viewer.recenterShort")}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function CardFront({ src, name, label, color }: { src: string | null; name: string; label: string; color: string | null }) {
  const { t } = useI18n();
  const [failed, setFailed] = useState(false);
  if (src && !failed)
    return <img className="viewer-card__image" src={src} alt={t("viewer.imageAlt", { name, printing: label })} crossOrigin="anonymous" draggable={false} onError={() => setFailed(true)} />;
  return (
    <span className="viewer-card__missing" style={{ borderTopColor: cardColor(color) }}>
      <CardPlaceholderIcon width={28} height={28} />
      <span>{t("viewer.imageMissing", { printing: label })}</span>
      <span className="viewer-card__missing-name">{name}</span>
    </span>
  );
}
