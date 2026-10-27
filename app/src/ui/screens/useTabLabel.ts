import { localize } from "../../domain/catalog.ts";
import { releaseShortName, type SetTab } from "../../domain/setTabs.ts";
import { useI18n } from "../../i18n/i18n.tsx";
import type { MessageKey } from "../../i18n/messages.ts";

/** Label of a set tab: the release short name ("Retail"), or the group ("Starters"). */
export function useTabLabel() {
  const { t, language } = useI18n();
  return (tab: SetTab, setName: string) =>
    tab.kind === "release" ? releaseShortName(localize(tab.releases[0]!.name, language), setName) : t(`group.${tab.group}` as MessageKey);
}
