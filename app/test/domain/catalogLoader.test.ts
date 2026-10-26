import { describe, expect, it } from "vitest";
import { CatalogError, checkCatalogUpdate, downloadCatalog } from "../../src/domain/catalogLoader.ts";
import { MemoryCatalogStore, fakeSource, nodeHasher, realCatalogText, realManifest } from "../helpers.ts";

async function expectCatalogError(promise: Promise<unknown>, code: string) {
  const error = await promise.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(CatalogError);
  expect((error as CatalogError).code).toBe(code);
}

describe("downloadCatalog", () => {
  it("downloads, checks and stores the real catalog", async () => {
    const store = new MemoryCatalogStore();
    const progress: (number | null)[] = [];
    const stored = await downloadCatalog({ store, source: fakeSource(), hasher: nodeHasher }, (p) => progress.push(p));

    expect(stored.manifest).toEqual(realManifest);
    expect(stored.catalog.cards).toHaveLength(realManifest.counts.cards);
    expect(stored.catalog.printings).toHaveLength(realManifest.counts.printings);
    expect(store.stored).toBe(stored);
    expect(progress.at(-1)).toBe(1);
  });

  it("refuses a catalog that does not match the manifest hash, and stores nothing", async () => {
    const store = new MemoryCatalogStore();
    const tampered = realCatalogText.replace('"legal": true', '"legal": false');
    await expectCatalogError(downloadCatalog({ store, source: fakeSource({ catalogText: tampered }), hasher: nodeHasher }), "integrity");
    expect(store.saves).toBe(0);
  });

  it("refuses a catalog whose counts differ from the manifest", async () => {
    const store = new MemoryCatalogStore();
    const catalog = JSON.parse(realCatalogText);
    catalog.cards.pop();
    const text = JSON.stringify(catalog);
    const manifest = { ...realManifest, hash: await nodeHasher.sha256(text) };
    await expectCatalogError(downloadCatalog({ store, source: fakeSource({ manifest, catalogText: text }), hasher: nodeHasher }), "integrity");
    expect(store.saves).toBe(0);
  });

  it("refuses a catalog with an unexpected format", async () => {
    const store = new MemoryCatalogStore();
    const catalog = JSON.parse(realCatalogText);
    catalog.schemaVersion = 2;
    const text = JSON.stringify(catalog);
    const manifest = { ...realManifest, hash: await nodeHasher.sha256(text) };
    await expectCatalogError(downloadCatalog({ store, source: fakeSource({ manifest, catalogText: text }), hasher: nodeHasher }), "invalid");
  });

  it("refuses an invalid manifest", async () => {
    await expectCatalogError(
      downloadCatalog({ store: new MemoryCatalogStore(), source: fakeSource({ manifest: { version: 1 } }), hasher: nodeHasher }),
      "invalid",
    );
  });

  it("reports a network failure as such", async () => {
    await expectCatalogError(
      downloadCatalog({ store: new MemoryCatalogStore(), source: fakeSource({ fail: true }), hasher: nodeHasher }),
      "network",
    );
  });
});


describe("checkCatalogUpdate (spec §6)", () => {
  it("compares the remote manifest hash with the stored one", async () => {
    expect(await checkCatalogUpdate(fakeSource(), realManifest)).toEqual({ status: "up-to-date" });
    const newer = { ...realManifest, version: "2026-11-02.1", hash: "sha256:other" };
    expect(await checkCatalogUpdate(fakeSource({ manifest: newer }), realManifest)).toEqual({ status: "available", manifest: newer });
    expect(await checkCatalogUpdate(fakeSource({ fail: true }), realManifest)).toEqual({ status: "error" });
  });
});
