import { buildCollectionFile, collectionFileName, serializeCollectionFile } from "../domain/collectionFile.ts";
import { collectionCsv } from "../domain/csv.ts";
import { useI18n } from "../i18n/i18n.tsx";
import { downloadTextFile } from "../platform/files.ts";
import { useApp } from "./AppContext.tsx";
import { useCollection } from "./CollectionContext.tsx";
import { languageLabel } from "./labels.ts";

/** Export of the collection (JSON backup, spec §4.3) and CSV (spec §4.4). */
export function useDataActions() {
  const { services, catalog, index, settings } = useApp();
  const { entries } = useCollection();
  const { t, language } = useI18n();
  return {
    exportCollection() {
      const now = new Date().toISOString();
      const file = buildCollectionFile({ entries: [...entries.values()], settings, appVersion: services.appVersion, catalogVersion: catalog.manifest.version, now });
      downloadTextFile(collectionFileName(now), serializeCollectionFile(file), "application/json");
    },
    exportCsv() {
      const now = new Date().toISOString();
      downloadTextFile(collectionFileName(now, "csv"), collectionCsv(index, [...entries.values()], language, (code) => languageLabel(t, code)), "text/csv;charset=utf-8");
    },
  };
}
