import { Navigate, useNavigate, useParams } from "react-router";
import { localize } from "../../domain/catalog.ts";
import { useI18n } from "../../i18n/i18n.tsx";
import { useApp } from "../AppContext.tsx";
import { ChevronLeftIcon } from "../icons.tsx";
import { useDocumentTitle } from "./useDocumentTitle.ts";

/**
 * Card page placeholder: the route exists so that the set grid can open it
 * (spec §5.1); its content (spec §5.9) is step 3.
 */
export function CardScreen() {
  const { slug } = useParams();
  const { index } = useApp();
  const { t, language } = useI18n();
  const navigate = useNavigate();
  const card = slug ? index.cardsBySlug.get(slug) : undefined;
  const name = card ? localize(card.name, language) : "";
  useDocumentTitle(name);
  if (!card) return <Navigate to="/sets" replace />;
  const printings = index.printingsByCard.get(card.id) ?? [];
  return (
    <>
      <header className="page-header">
        <button type="button" className="icon-button" aria-label={t("card.back")} onClick={() => navigate(-1)}>
          <ChevronLeftIcon width={22} height={22} />
        </button>
        <h1 className="page-header__title">{name}</h1>
      </header>
      <div className="screen">
        <p className="screen__text">{t("card.printings", { count: printings.length })}</p>
      </div>
    </>
  );
}
