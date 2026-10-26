import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { catalogSchema, manifestSchema } from "../../src/domain/catalog.ts";
import type { CollectionEntry } from "../../src/domain/collection.ts";
import { DEFAULT_SETTINGS } from "../../src/domain/settings.ts";
import { NovaPreemDatabase } from "../../src/storage/db.ts";
import { DexieCatalogStore, DexieCollectionStore, DexieSettingsStore } from "../../src/storage/dexieStores.ts";
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
