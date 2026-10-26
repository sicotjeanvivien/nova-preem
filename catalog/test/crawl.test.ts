import { describe, expect, it } from "vitest";
import { crawlImages, type CrawlDependencies } from "../src/crawl.ts";
import type { DownloadResult } from "../src/images.ts";
import type { SourceCard, SourcePage, SourcePrinting } from "../src/sources/types.ts";

const NOW = Date.parse("2026-10-26T10:00:00Z");
const VALID = "2026-10-26T10:05:00.000Z";
const EXPIRED = "2026-10-26T09:50:00.000Z";

function printing(id: string, generation: number, expiresAt: string): SourcePrinting {
  return {
    id,
    collectorNumber: "001",
    editionCode: "welcometonightcityretail",
    editionName: "Welcome to Night City — Retail",
    rarity: "Common",
    language: "en",
    localizedName: null,
    printedRulesText: null,
    officialRulesText: null,
    artist: null,
    finish: null,
    imageUrl: `https://cdn.example/${id}/render-v1.webp?gen=${generation}`,
    imageVersion: "render-v1.webp",
    imageExpiresAt: expiresAt,
  };
}

function card(id: string, printings: SourcePrinting[]): SourceCard {
  return {
    id, slug: id, name: id, baseName: id, type: "Unit", color: "Red", classifications: [], keywords: [],
    cost: 1, power: 1, ram: null, eddiable: false, rulesText: null, legality: "legal", printings,
  };
}

/** A page whose image URLs are those of `generation`; refresh() moves to the next generation with valid URLs. */
function fakePage(ids: string[], firstExpiresAt: string) {
  let generation = 0;
  const build = (expiresAt: string) => [card("c", ids.map((id) => printing(id, generation, expiresAt)))];
  const page = {
    cards: build(firstExpiresAt),
    fetchedAt: "2026-10-26T09:45:00.000Z",
    total: 1,
    refreshes: 0,
    async refresh() {
      generation++;
      page.refreshes++;
      page.cards = build(VALID);
    },
  };
  return page satisfies SourcePage;
}

async function* pagesOf(...pages: SourcePage[]) {
  yield* pages;
}

function fakeStore(initial: Record<string, string> = {}) {
  const versions = new Map(Object.entries(initial));
  return {
    versions,
    flushes: 0,
    needs: (p: SourcePrinting) => versions.get(p.id) !== p.imageVersion,
    async save(id: string, version: string) {
      versions.set(id, version);
      return { version, width: 733, height: 1024 };
    },
    async flush() {
      this.flushes++;
    },
  };
}

function fakeDownload(respond: (p: SourcePrinting) => DownloadResult) {
  const requested: string[] = [];
  const download = async (p: SourcePrinting) => {
    requested.push(p.imageUrl);
    return respond(p);
  };
  return { requested, download };
}

const ok = (): DownloadResult => ({ ok: true, bytes: Buffer.from("image") });

function deps(store: ReturnType<typeof fakeStore>, download: CrawlDependencies["download"]): CrawlDependencies {
  return { store, download, now: () => NOW };
}

describe("crawlImages", () => {
  it("downloads missing images and skips those already up to date", async () => {
    const page = fakePage(["a", "b", "c"], VALID);
    const store = fakeStore({ b: "render-v1.webp" });
    const { requested, download } = fakeDownload(ok);

    const stats = await crawlImages(pagesOf(page), deps(store, download));
    expect(requested).toEqual(["https://cdn.example/a/render-v1.webp?gen=0", "https://cdn.example/c/render-v1.webp?gen=0"]);
    expect(stats).toMatchObject({ pages: 1, downloaded: 2, upToDate: 1, pageRefreshes: 0, failures: [] });
    expect(store.flushes).toBe(1);
  });

  it("fetches the page again before downloading when its URLs have already expired", async () => {
    const page = fakePage(["a", "b"], EXPIRED);
    const { requested, download } = fakeDownload(ok);

    const stats = await crawlImages(pagesOf(page), deps(fakeStore(), download));
    expect(page.refreshes).toBe(1);
    expect(requested.every((url) => url.endsWith("gen=1"))).toBe(true);
    expect(stats).toMatchObject({ downloaded: 2, pageRefreshes: 1 });
  });

  it("fetches the page again when the server says a URL has expired, then resumes", async () => {
    const page = fakePage(["a", "b", "c"], VALID);
    const { requested, download } = fakeDownload((p) =>
      p.id === "b" && p.imageUrl.endsWith("gen=0") ? { ok: false, expired: true, reason: "HTTP 403" } : ok(),
    );

    const stats = await crawlImages(pagesOf(page), deps(fakeStore(), download));
    expect(requested.map((url) => url.replace("https://cdn.example/", ""))).toEqual([
      "a/render-v1.webp?gen=0",
      "b/render-v1.webp?gen=0",
      "b/render-v1.webp?gen=1",
      "c/render-v1.webp?gen=1",
    ]);
    expect(stats).toMatchObject({ downloaded: 3, pageRefreshes: 1, failures: [] });
  });

  it("gives up after a bounded number of page refreshes", async () => {
    const page = fakePage(["a", "b"], VALID);
    const { download } = fakeDownload(() => ({ ok: false, expired: true, reason: "HTTP 403" }));

    const stats = await crawlImages(pagesOf(page), deps(fakeStore(), download));
    expect(page.refreshes).toBe(3);
    expect(stats.downloaded).toBe(0);
    expect(stats.failures.map((f) => f.printingId)).toEqual(["a", "b"]);
  });

  it("records other failures without refreshing the page, and goes on", async () => {
    const page = fakePage(["a", "b"], VALID);
    const { download } = fakeDownload((p) => (p.id === "a" ? { ok: false, expired: false, reason: "HTTP 404" } : ok()));

    const stats = await crawlImages(pagesOf(page), deps(fakeStore(), download));
    expect(page.refreshes).toBe(0);
    expect(stats.downloaded).toBe(1);
    expect(stats.failures).toEqual([{ printingId: "a", label: "c [welcometonightcityretail 001 en]", reason: "HTTP 404" }]);
  });

  it("downloads again an image whose source art changed", async () => {
    const page = fakePage(["a"], VALID);
    const store = fakeStore({ a: "render-v0.webp" });
    const { requested, download } = fakeDownload(ok);

    await crawlImages(pagesOf(page), deps(store, download));
    expect(requested).toHaveLength(1);
    expect(store.versions.get("a")).toBe("render-v1.webp");
  });
});
