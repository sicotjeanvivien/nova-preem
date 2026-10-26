import { useRef, useState } from "react";
import { parseCollectionFile, type CollectionFile, type ImportError } from "../domain/collectionFile.ts";
import { useI18n } from "../i18n/i18n.tsx";
import type { MessageKey } from "../i18n/messages.ts";
import { ImportDialog } from "./ImportDialog.tsx";

/**
 * Import of a backup (spec §4.3), from the settings or the empty collection:
 * `open()` asks for a file; `element` holds the hidden input and the dialog.
 */
export function useImportFlow(onMessage: (text: string) => void) {
  const { t } = useI18n();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<CollectionFile | null>(null);

  const onFile = async (chosen: File | undefined) => {
    if (input.current) input.current.value = "";
    if (!chosen) return;
    const parsed = parseCollectionFile(await chosen.text());
    if (parsed.ok) setFile(parsed.file);
    else onMessage(t(`import.error.${parsed.error satisfies ImportError}` as MessageKey));
  };

  const element = (
    <>
      <input
        ref={input}
        type="file"
        accept="application/json,.json"
        className="visually-hidden"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => void onFile(event.target.files?.[0])}
      />
      {file && (
        <ImportDialog
          file={file}
          onClose={() => setFile(null)}
          onDone={(count) => {
            setFile(null);
            onMessage(t("import.done", { count }));
          }}
        />
      )}
    </>
  );
  return { open: () => input.current?.click(), element };
}
