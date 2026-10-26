import type { ReactNode } from "react";
import { useI18n } from "../../i18n/i18n.tsx";
import type { MessageKey } from "../../i18n/messages.ts";
import { useDocumentTitle } from "./useDocumentTitle.ts";

/** A tab whose content comes with a later step (docs/app-spec.md §10): title only. */
export function EmptyScreen({ title, children }: { title: MessageKey; children?: ReactNode }) {
  const { t } = useI18n();
  useDocumentTitle(t(title));
  return (
    <>
      <header className="topbar">
        <h1>{t(title)}</h1>
      </header>
      {children && <div className="screen">{children}</div>}
    </>
  );
}

export const SearchScreen = () => <EmptyScreen title="search.title" />;
export const StatsScreen = () => <EmptyScreen title="stats.title" />;

export function SettingsScreen() {
  const { t } = useI18n();
  return (
    <EmptyScreen title="settings.title">
      <p className="screen__legal">{t("legal.settings")}</p>
    </EmptyScreen>
  );
}
