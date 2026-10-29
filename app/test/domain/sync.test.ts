import { describe, expect, it } from "vitest";
import type { CollectionEntry } from "../../src/domain/collection.ts";
import type { FileSettings } from "../../src/domain/collectionFile.ts";
import {
  connectedState,
  firstSyncAction,
  mergeCollections,
  mergeEntries,
  mergeSettings,
  pendingChangeCount,
  planFirstSync,
  resolveFirstSync,
  sameContent,
  syncStateSchema,
  syncStatus,
  tokenValid,
  type SyncContent,
  type SyncFacts,
} from "../../src/domain/sync.ts";

const T1 = "2026-10-20T10:00:00.000Z";
const T2 = "2026-10-26T10:00:00.000Z";
const T3 = "2026-10-29T10:00:00.000Z";
const e = (printingId: string, quantity: number, first = T1, last = first): CollectionEntry => ({ printingId, quantity, firstAddedAt: first, lastAddedAt: last });
const SETTINGS: FileSettings = { entryReleaseId: "wnc-retail", entryLanguage: "fr", duplicateThreshold: 1, completionGroups: ["main", "starter"], cardNameLanguage: "entry" };
const content = (entries: CollectionEntry[], settings: Partial<FileSettings> = {}): SyncContent => ({ entries, settings: { ...SETTINGS, ...settings } });

/** Quantity of `id` after merging base, local and remote quantities (undefined: no entry). */
function merged(base: number | undefined, local: number | undefined, remote: number | undefined): number | undefined {
  const side = (quantity: number | undefined) => (quantity === undefined ? [] : [e("p", quantity)]);
  return mergeEntries(side(base), side(local), side(remote)).find((entry) => entry.printingId === "p")?.quantity;
}

describe("three-way merge of the entries (sync spec §3.2)", () => {
  it("keeps an addition made on one device", () => {
    expect(merged(1, 3, 1)).toBe(3);
    expect(merged(1, 1, 3)).toBe(3);
  });

  it("keeps a removal made on one device: the entry disappears", () => {
    expect(merged(2, undefined, 2)).toBeUndefined();
    expect(merged(2, 2, undefined)).toBeUndefined();
    expect(merged(3, 1, 3)).toBe(1);
  });

  it("adds up additions made on both devices (two boosters offline)", () => {
    expect(merged(1, 2, 3)).toBe(4);
  });

  it("never goes below 0 when both devices removed copies", () => {
    expect(merged(2, 1, undefined)).toBeUndefined();
  });

  it("counts a new printing entered on both devices twice", () => {
    expect(merged(undefined, 1, 1)).toBe(2);
  });

  it("changes nothing when neither side changed, or both made the same change from nothing", () => {
    expect(merged(2, 2, 2)).toBe(2);
    expect(merged(undefined, undefined, undefined)).toBeUndefined();
  });

  it("keeps the oldest first addition and the latest addition, and sorts by printing", () => {
    const result = mergeEntries([e("b", 1, T2)], [e("b", 2, T2, T3), e("a", 1, T2)], [e("b", 1, T1, T2)]);
    expect(result).toEqual([e("a", 1, T2), e("b", 2, T1, T3)]);
  });

  it("keeps printings unknown to the catalog like any other", () => {
    expect(mergeEntries([], [], [e("not-in-catalog", 2)])).toEqual([e("not-in-catalog", 2)]);
  });
});

describe("three-way merge of the settings (sync spec §3.2)", () => {
  it("takes the side that changed since the base", () => {
    expect(mergeSettings(SETTINGS, { ...SETTINGS, duplicateThreshold: 3 }, SETTINGS).duplicateThreshold).toBe(3);
    expect(mergeSettings(SETTINGS, SETTINGS, { ...SETTINGS, entryLanguage: "en" }).entryLanguage).toBe("en");
  });

  it("lets the device win when both changed the same setting", () => {
    expect(mergeSettings(SETTINGS, { ...SETTINGS, duplicateThreshold: 3 }, { ...SETTINGS, duplicateThreshold: 5 }).duplicateThreshold).toBe(3);
  });

  it("merges each setting on its own", () => {
    const result = mergeSettings(SETTINGS, { ...SETTINGS, completionGroups: ["main"] }, { ...SETTINGS, cardNameLanguage: "en" });
    expect(result).toEqual({ ...SETTINGS, completionGroups: ["main"], cardNameLanguage: "en" });
  });

  it("treats a setting missing from the remote file as unchanged", () => {
    expect(mergeSettings(SETTINGS, SETTINGS, undefined)).toEqual(SETTINGS);
    expect(mergeSettings(SETTINGS, { ...SETTINGS, entryLanguage: "en" }, { duplicateThreshold: 2 })).toEqual({ ...SETTINGS, entryLanguage: "en", duplicateThreshold: 2 });
  });
});

describe("mergeCollections", () => {
  it("merges entries and settings together", () => {
    const base = content([e("a", 1)]);
    const result = mergeCollections(base, content([e("a", 2)]), { entries: [e("a", 1), e("b", 1)], settings: { duplicateThreshold: 2 } });
    expect(result).toEqual(content([e("a", 2), e("b", 1)], { duplicateThreshold: 2 }));
  });
});

describe("sameContent", () => {
  it("ignores the order of the entries, not their dates or the settings", () => {
    expect(sameContent(content([e("a", 1), e("b", 1)]), content([e("b", 1), e("a", 1)]))).toBe(true);
    expect(sameContent(content([e("a", 1)]), content([e("a", 1, T1, T2)]))).toBe(false);
    expect(sameContent(content([e("a", 1)]), content([e("a", 1)], { duplicateThreshold: 2 }))).toBe(false);
    expect(sameContent(content([e("a", 1)]), content([]))).toBe(false);
  });
});

describe("first sync of a device (sync spec §3.3)", () => {
  it("creates the file when Drive has none", () => {
    expect(firstSyncAction([], undefined)).toBe("create");
    expect(firstSyncAction([e("a", 1)], undefined)).toBe("create");
  });

  it("takes the file when the device collection is empty", () => {
    expect(firstSyncAction([], { entries: [e("a", 1)] })).toBe("take-remote");
  });

  it("asks when both sides hold a collection", () => {
    expect(firstSyncAction([e("a", 1)], { entries: [e("b", 1)] })).toBe("ask");
  });

  it("asks nothing when the file holds no entry: the device collection is kept", () => {
    expect(firstSyncAction([e("a", 1)], { entries: [] })).toBe("keep-local");
  });

  const local = content([e("a", 2), e("b", 1, T2)], { duplicateThreshold: 3 });
  const remote = { entries: [e("b", 3, T1), e("c", 1)], settings: { duplicateThreshold: 5, entryLanguage: "en" } };

  it("merge: the largest quantity of each printing, like the import, and the device's settings", () => {
    expect(resolveFirstSync("merge", local, remote)).toEqual(content([e("a", 2), e("b", 3, T1, T2), e("c", 1)], { duplicateThreshold: 3 }));
  });

  it("keep remote: the file's entries and its settings where it has them", () => {
    expect(resolveFirstSync("keep-remote", local, remote)).toEqual(content([e("b", 3, T1), e("c", 1)], { duplicateThreshold: 5, entryLanguage: "en" }));
  });

  it("keep local: the device's content", () => {
    expect(resolveFirstSync("keep-local", local, remote)).toEqual(local);
  });

  it("summarizes what each side gains and loses, for each choice", () => {
    const known = (id: string) => id !== "c";
    expect(planFirstSync("merge", local, remote, known)).toMatchObject({
      device: { added: 1, modified: 1, removed: 0 },
      drive: { added: 1, modified: 1, removed: 0 },
      unknown: 1,
    });
    expect(planFirstSync("keep-remote", local, remote, known)).toMatchObject({
      device: { added: 1, modified: 1, removed: 1 },
      drive: { added: 0, modified: 0, removed: 0 },
    });
    expect(planFirstSync("keep-local", local, remote, known)).toMatchObject({
      device: { added: 0, modified: 0, removed: 0 },
      drive: { added: 1, modified: 1, removed: 1 },
      unknown: 0,
    });
  });
});

describe("status (sync spec §5.3)", () => {
  const facts: SyncFacts = { connected: true, tokenValid: true, syncing: false, lastError: null, pendingChanges: 0 };

  it("is up to date, pending, syncing or paused depending on the facts", () => {
    expect(syncStatus(facts)).toBe("up-to-date");
    expect(syncStatus({ ...facts, pendingChanges: 3 })).toBe("pending");
    expect(syncStatus({ ...facts, pendingChanges: 3, syncing: true })).toBe("syncing");
    expect(syncStatus({ ...facts, tokenValid: false })).toBe("paused");
    expect(syncStatus({ ...facts, tokenValid: false, pendingChanges: 3 })).toBe("paused");
  });

  it("is disabled without an account, or once Google Drive access was withdrawn", () => {
    expect(syncStatus({ ...facts, connected: false })).toBe("disabled");
    expect(syncStatus({ ...facts, lastError: "revoked" })).toBe("disabled");
  });

  it("shows a lasting error until the next successful sync", () => {
    expect(syncStatus({ ...facts, lastError: "invalid-file" })).toBe("error");
    expect(syncStatus({ ...facts, lastError: "storage-full", tokenValid: false })).toBe("error");
  });

  it("counts the pending changes from the base: printings and settings that differ", () => {
    const base = content([e("a", 1), e("b", 1)]);
    expect(pendingChangeCount(base, content([e("a", 1), e("b", 1)]))).toBe(0);
    expect(pendingChangeCount(base, content([e("a", 2), e("c", 1)]))).toBe(3);
    expect(pendingChangeCount(base, content([e("a", 1), e("b", 1)], { duplicateThreshold: 2 }))).toBe(1);
    expect(pendingChangeCount(null, content([]))).toBe(0);
    expect(pendingChangeCount(null, content([e("a", 1), e("b", 2)]))).toBe(2);
  });
});

describe("state kept on the device", () => {
  it("starts without a file nor a base after connecting", () => {
    const state = connectedState("someone@example.com", { value: "token", expiresAt: T3 });
    expect(syncStateSchema.parse(state)).toEqual(state);
    expect(state).toMatchObject({ fileId: null, base: null, lastSyncAt: null, lastError: null, notice: null });
  });

  it("keeps the warning of the last sync", () => {
    const state = connectedState(null, null);
    expect(syncStateSchema.parse({ ...state, notice: { kind: "other-files", count: 2 } }).notice).toEqual({ kind: "other-files", count: 2 });
    expect(syncStateSchema.safeParse({ ...state, notice: { kind: "other-files", count: 0 } }).success).toBe(false);
  });

  it("considers the token valid until it expires", () => {
    const token = { value: "token", expiresAt: T2 };
    expect(tokenValid(token, T1)).toBe(true);
    expect(tokenValid(token, T2)).toBe(false);
    expect(tokenValid(null, T1)).toBe(false);
  });
});
