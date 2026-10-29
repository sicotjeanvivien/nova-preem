import "fake-indexeddb/auto";
import { Dexie } from "dexie";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { catalogSchema, manifestSchema } from "../../src/domain/catalog.ts";
import type { CollectionEntry } from "../../src/domain/collection.ts";
import { DEFAULT_SETTINGS } from "../../src/domain/settings.ts";
import { connectedState } from "../../src/domain/sync.ts";
import { NovaPreemDatabase } from "../../src/storage/db.ts";
import { DexieCatalogStore, DexieCollectionStore, DexieSettingsStore, DexieSyncStore } from "../../src/storage/dexieStores.ts";
import { realCatalogText, realManifest } from "../helpers.ts";

let db: NovaPreemDatabase;
beforeEach(() => {
  db = new NovaPreemDatabase(`test-${crypto.randomUUID()}`);
});
afterEach(async () => {
  await db.delete();
});

function entry(printingId: string, quantity = 1): CollectionEntry {
  return { printingId, quantity, firstAddedAt: "2026-10-26T10:00:00.000Z", lastAddedAt: "2026-10-26T10:00:00.000Z" };
}

describe("DexieCatalogStore", () => {
  it("is empty before the first download, then keeps catalog and manifest together", async () => {
    const store = new DexieCatalogStore(db);
    expect(await store.load()).toBeUndefined();
    const stored = { manifest: manifestSchema.parse(realManifest), catalog: catalogSchema.parse(JSON.parse(realCatalogText)) };
    await store.save(stored);
    const loaded = await new DexieCatalogStore(db).load();
    expect(loaded?.manifest).toEqual(stored.manifest);
    expect(loaded?.catalog.cards).toHaveLength(151);
  });
});

describe("DexieCollectionStore", () => {
  it("creates, reads, replaces and removes entries", async () => {
    const store = new DexieCollectionStore(db);
    await store.put(entry("b"));
    await store.put(entry("a"));
    await store.put(entry("b", 3));
    expect(await store.get("b")).toEqual(entry("b", 3));
    await store.remove("a");
    expect(await store.list()).toEqual([entry("b", 3)]);
  });

  it("replaces the whole collection and exports it sorted by printingId", async () => {
    const store = new DexieCollectionStore(db);
    await store.put(entry("old"));
    await store.replaceAll([entry("z"), entry("c", 2), entry("m")]);
    expect((await store.exportAll()).map((e) => e.printingId)).toEqual(["c", "m", "z"]);
  });
});

describe("DexieSettingsStore", () => {
  it("returns the defaults, then the stored changes", async () => {
    const store = new DexieSettingsStore(db);
    expect(await store.load()).toEqual(DEFAULT_SETTINGS);
    expect(await store.update({ duplicateThreshold: 3, interfaceLanguage: "en" })).toEqual({
      ...DEFAULT_SETTINGS,
      duplicateThreshold: 3,
      interfaceLanguage: "en",
    });
    expect((await new DexieSettingsStore(db).load()).duplicateThreshold).toBe(3);
  });

  it("refuses invalid changes and ignores invalid stored values", async () => {
    const store = new DexieSettingsStore(db);
    await expect(store.update({ duplicateThreshold: 12 })).rejects.toThrow();
    await db.settings.put({ key: "duplicateThreshold", value: "beaucoup" });
    expect((await store.load()).duplicateThreshold).toBe(1);
  });
});

describe("DexieSyncStore", () => {
  const state = connectedState("someone@example.com", { value: "token", expiresAt: "2026-10-29T11:00:00.000Z" });

  it("is empty while sync is off, keeps the state, and forgets it on disconnection", async () => {
    const store = new DexieSyncStore(db);
    expect(await store.load()).toBeUndefined();
    const synced = { ...state, fileId: "file", base: { entries: [entry("a", 2)], settings: { ...DEFAULT_SETTINGS } }, baseVersion: "7", lastSyncAt: "2026-10-29T10:00:00.000Z" };
    await store.save(synced);
    expect(await new DexieSyncStore(db).load()).toEqual({
      ...synced,
      // Only the synced settings are part of the base.
      base: { entries: [entry("a", 2)], settings: { entryReleaseId: "wnc-retail", entryLanguage: "fr", duplicateThreshold: 1, completionGroups: ["main", "starter"], cardNameLanguage: "entry" } },
    });
    await store.clear();
    expect(await store.load()).toBeUndefined();
  });

  it("ignores an invalid stored state, as if sync were off", async () => {
    await db.sync.put({ key: "state", value: { provider: "dropbox" } });
    expect(await new DexieSyncStore(db).load()).toBeUndefined();
  });
});

describe("migration to version 2 (sync table)", () => {
  it("keeps the collection, settings and catalog of a version 1 database", async () => {
    const name = db.name;
    await db.delete();
    const v1 = new Dexie(name);
    v1.version(1).stores({ entries: "printingId", settings: "key", catalog: "key" });
    await v1.table("entries").put(entry("kept", 3));
    await v1.table("settings").put({ key: "duplicateThreshold", value: 2 });
    v1.close();

    db = new NovaPreemDatabase(name);
    expect(await new DexieCollectionStore(db).list()).toEqual([entry("kept", 3)]);
    expect((await new DexieSettingsStore(db).load()).duplicateThreshold).toBe(2);
    expect(await new DexieSyncStore(db).load()).toBeUndefined();
  });
});
