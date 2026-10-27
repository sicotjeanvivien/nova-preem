import { useI18n } from "../i18n/i18n.tsx";

/** Bottom banner after an entry: "+1 [nom] · VF" with Annuler (spec §5.1). */
export function Toast({ text, onUndo }: { text: string; onUndo?: () => void }) {
  const { t } = useI18n();
  return (
    <div className="toast" role="status">
      <span className="toast__text">{text}</span>
      {onUndo && (
        <button type="button" className="toast__undo" onClick={onUndo}>
          {t("setPage.undo")}
        </button>
      )}
    </div>
  );
}
