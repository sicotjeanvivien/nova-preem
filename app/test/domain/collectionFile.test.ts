import { describe, expect, it } from "vitest";
import type { CollectionEntry } from "../../src/domain/collection.ts";
import {
  buildCollectionFile,
  collectionFileName,
  parseCollectionFile,
  planImport,
  serializeCollectionFile,
} from "../../src/domain/collectionFile.ts";
import { DEFAULT_SETTINGS } from "../../src/domain/settings.ts";
import { index, printingOf } from "../helpers-catalog.ts";

const T1 = "2026-10-20T10:00:00.000Z";
const T2 = "2026-10-26T10:00:00.000Z";
const e = (printingId: string, quantity: number, first = T1, last = T1): CollectionEntry => ({ printingId, quantity, firstAddedAt: first, lastAddedAt: last });
const johnny = printingOf("Johnny Silverhand — Rocking Renegade", "wnc-retail", "fr").id;
const chrome = printingOf("Chrome Fang", "wnc-retail", "fr").id;
const mantis = printingOf("Mantis Blades", "wnc-retail", "en").id;
const known = (id: string) => index.printings.has(id);

const exportText = (entries: CollectionEntry[]) =>
  serializeCollectionFile(buildCollectionFile({ entries, settings: DEFAULT_SETTINGS, appVersion: "0.1.0", catalogVersion: "2026-10-26.4", now: T2 }));

describe("export file (spec §4.3)", () => {
  it("has the documented format, entries sorted by printing", () => {
    const file = JSON.parse(exportText([e(mantis, 1), e(johnny, 2), e(chrome, 1)]));
    expect(file).toMatchObject({ format: "nova-preem/collection", schemaVersion: 1, exportedAt: T2, app: { version: "0.1.0" }, catalog: { version: "2026-10-26.4" } });
    expect(file.entries.map((x: CollectionEntry) => x.printingId)).toEqual([johnny, chrome, mantis].sort());
    expect(file.settings).toEqual({ entryReleaseId: "wnc-retail", entryLanguage: "fr", duplicateThreshold: 1, completionGroups: ["main", "starter"], cardNameLanguage: "entry" });
    expect(collectionFileName(T2)).toBe("nova-preem-collection-2026-10-26.json");
  });

  it("is refused with a clear reason when it is not a collection file", () => {
    expect(parseCollectionFile("{oops")).toEqual({ ok: false, error: "not-json" });
    expect(parseCollectionFile(JSON.stringify({ format: "other", schemaVersion: 1 }))).toEqual({ ok: false, error: "unknown-format" });
    expect(parseCollectionFile(exportText([]).replace('"schemaVersion": 1', '"schemaVersion": 2'))).toEqual({ ok: false, error: "unknown-version" });
    expect(parseCollectionFile(exportText([e(johnny, 1)]).replace('"quantity": 1', '"quantity": 0'))).toEqual({ ok: false, error: "invalid" });
    const twice = JSON.parse(exportText([e(johnny, 1)]));
    twice.entries.push(twice.entries[0]);
    expect(parseCollectionFile(JSON.stringify(twice))).toEqual({ ok: false, error: "invalid" });
  });
});

describe("import (spec §4.3)", () => {
  it("export, empty the collection, import: the same collection (step 7 criterion)", () => {
    const original = [e(johnny, 2, T1, T2), e(chrome, 1), e("printing-from-a-future-catalog", 3)];
    const parsed = parseCollectionFile(exportText(original));
    if (!parsed.ok) throw new Error(parsed.error);
    const plan = planImport([], parsed.file.entries, "replace", known);
    expect(plan.entries).toEqual([...original].sort((a, b) => (a.printingId < b.printingId ? -1 : 1)));
    expect(plan).toMatchObject({ added: 3, modified: 0, removed: 0, unknown: 1 });
  });

  it("replace: the collection becomes the file's", () => {
    const plan = planImport([e(johnny, 1), e(chrome, 1)], [e(johnny, 3), e(mantis, 1)], "replace", known);
    expect(plan.entries.map((x) => [x.printingId, x.quantity])).toEqual([[johnny, 3], [mantis, 1]].sort((a, b) => (a[0]! < b[0]! ? -1 : 1)));
    expect(plan).toMatchObject({ added: 1, modified: 1, removed: 1, unknown: 0 });
  });

  it("merge: largest quantity and extreme dates for each printing, nothing removed", () => {
    const plan = planImport(
      [e(johnny, 3, T1, T1), e(chrome, 1)],
      [e(johnny, 2, T2, T2), e(mantis, 1), e("unknown-id", 1)],
      "merge",
      known,
    );
    expect(plan.entries.find((x) => x.printingId === johnny)).toEqual(e(johnny, 3, T1, T2));
    expect(plan.entries).toHaveLength(4);
    expect(plan).toMatchObject({ added: 2, modified: 1, removed: 0, unknown: 1 });
  });

  it("counts nothing when merging an identical file", () => {
    const entries = [e(johnny, 2), e(chrome, 1)];
    expect(planImport(entries, entries, "merge", known)).toMatchObject({ added: 0, modified: 0, removed: 0 });
  });
});
