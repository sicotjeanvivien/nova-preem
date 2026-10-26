import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { PoliteClient } from "../src/http.ts";
import { NetdeckSource, parseListPage, toSnapshot } from "../src/sources/netdeck.ts";
import { FETCHED_AT, loadSamplePage, snapshotFrom } from "./helpers.ts";

describe("Netdeck adapter", () => {
  it("maps a real list page to source-neutral cards", () => {
    const snapshot = snapshotFrom(loadSamplePage());
    expect(snapshot).toMatchObject({ source: "netdeck", fetchedAt: FETCHED_AT, total: 9 });

    const johnny = snapshot.cards.find((card) => card.slug === "johnny-silverhand-rocking-renegade")!;
    expect(johnny).toMatchObject({
      name: "Johnny Silverhand — Rocking Renegade",
      baseName: "Johnny Silverhand",
      type: "Legend",
      color: "Red",
      cost: null,
      ram: 2,
      eddiable: true,
      legality: "legal",
    });
    const french = johnny.printings.find((printing) => printing.language === "fr")!;
    expect(french).toMatchObject({
      collectorNumber: "003",
      editionCode: "welcometonightcityretail-fr",
      localizedName: "Johnny Silverhand — Rock'n'Rebelle",
      officialRulesText: null,
    });
    expect(french.imageVersion).toMatch(/^render-.+\.webp$/);
  });

  it("fails with a readable message when the format changes", () => {
    const page = loadSamplePage();
    delete page.items[1].printings[0].collector_number;
    expect(() => parseListPage(page)).toThrow(/unexpected format[\s\S]*collector_number/);

    const renamed = loadSamplePage();
    renamed.items[0].card_type = 42;
    expect(() => parseListPage(renamed)).toThrow(/card_type/);
  });

  it("fails when fewer cards than announced are received", () => {
    const page = loadSamplePage();
    page.total = 10;
    expect(() => snapshotFrom(page)).toThrow(/received 9 cards but the source announces 10/);
  });

  it("fails when the announced total changes between pages", () => {
    const first = loadSamplePage();
    const second = loadSamplePage();
    second.total = 18;
    expect(() =>
      toSnapshot([
        { fetchedAt: FETCHED_AT, page: parseListPage(first) },
        { fetchedAt: FETCHED_AT, page: parseListPage(second) },
      ]),
    ).toThrow(/total changed/);
  });
});

describe("Netdeck adapter: pages and cache", () => {
  /** Fake API serving the sample cards, with a new image signature on every request. */
  function fakeApi() {
    const sample = loadSamplePage();
    const requests: string[] = [];
    const client = {
      requestCount: 0,
      async fetch(url: string) {
        requests.push(url.replace(/^.*\?/, ""));
        const params = new URL(url).searchParams;
        const [limit, offset] = [Number(params.get("limit")), Number(params.get("offset"))];
        const items = sample.items.slice(offset, offset + limit).map((item) => ({
          ...item,
          printings: item.printings.map((p: { image_url: string }) => ({
            ...p,
            image_url: p.image_url.replace(/Signature=[^&]*/, `Signature=request${requests.length}`),
          })),
        }));
        return new Response(JSON.stringify({ items, total: sample.total, limit, offset }));
      },
    } as unknown as PoliteClient;
    return { client, requests };
  }

  let cacheDir: string;
  beforeEach(async () => {
    cacheDir = await mkdtemp(join(tmpdir(), "nova-preem-netdeck-"));
  });
  afterEach(async () => {
    await rm(cacheDir, { recursive: true, force: true });
  });

  it("walks the pages, caches them, and reads them back offline", async () => {
    const { client, requests } = fakeApi();
    const source = new NetdeckSource({ cacheDir, client });
    const sizes: number[] = [];
    for await (const page of source.pages(4)) sizes.push(page.cards.length);
    expect(sizes).toEqual([4, 4, 1]);
    expect(requests).toEqual(["limit=4&offset=0", "limit=4&offset=4", "limit=4&offset=8"]);

    const offline = await new NetdeckSource({ cacheDir, offline: true }).fetchSnapshot();
    expect(offline.cards).toHaveLength(9);
    expect(requests).toHaveLength(3);
  });

  it("refreshes a page from the network to get new image URLs", async () => {
    const { client, requests } = fakeApi();
    const source = new NetdeckSource({ cacheDir, client });
    for await (const page of source.pages(9)) {
      const before = page.cards[0]!.printings[0]!.imageUrl;
      await page.refresh();
      expect(page.cards[0]!.printings[0]!.imageUrl).not.toBe(before);
      expect(page.cards[0]!.printings[0]!.imageExpiresAt).toMatch(/^\d{4}-\d\d-\d\dT/);
    }
    expect(requests).toHaveLength(2);
  });

  it("reads back a cache made of pages of different sizes", async () => {
    const { client } = fakeApi();
    for await (const page of new NetdeckSource({ cacheDir, client }).pages(6)) void page;
    // A later crawl with smaller pages refreshes the first page only: pagination follows what was received.
    const source = new NetdeckSource({ cacheDir, client });
    for await (const page of source.pages(3)) {
      if (page.cards.length === 6) await page.refresh();
    }
    const offline = await new NetdeckSource({ cacheDir, offline: true }).fetchSnapshot();
    expect(offline.cards.map((c) => c.slug)).toEqual(loadSamplePage().items.map((item) => item.slug));
  });

  it("fails offline when a page is missing from the cache", async () => {
    await expect(new NetdeckSource({ cacheDir, offline: true }).fetchSnapshot()).rejects.toThrow(/not in the cache/);
  });
});
