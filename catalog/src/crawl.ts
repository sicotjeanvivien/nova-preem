import { pathToFileURL } from "node:url";
import { ImageStore, downloadImage, type DownloadResult } from "./images.ts";
import { CACHE_DIR, IMAGES_DIR } from "./paths.ts";
import { NetdeckSource } from "./sources/netdeck.ts";
import type { SourcePage, SourcePrinting } from "./sources/types.ts";

/** Do not start a download with a URL expiring sooner than this. */
const EXPIRY_MARGIN_MS = 10_000;
/** Bounds the number of re-downloads of a page whose image URLs keep expiring. */
const MAX_REFRESHES_PER_PAGE = 3;

export interface CrawlFailure {
  printingId: string;
  label: string;
  reason: string;
}

export interface CrawlStats {
  pages: number;
  pageRefreshes: number;
  downloaded: number;
  upToDate: number;
  failures: CrawlFailure[];
}

export interface CrawlDependencies {
  download(printing: SourcePrinting): Promise<DownloadResult>;
  store: Pick<ImageStore, "needs" | "save" | "flush">;
  now?: () => number;
  log?: (message: string) => void;
}

/**
 * Walks the pages and downloads the missing or outdated images of each page
 * right away: signed image URLs expire a few minutes after the page was
 * fetched (spec §6). When they have expired, the page is fetched again.
 */
export async function crawlImages(pages: AsyncIterable<SourcePage>, deps: CrawlDependencies): Promise<CrawlStats> {
  const now = deps.now ?? Date.now;
  const log = deps.log ?? (() => {});
  const stats: CrawlStats = { pages: 0, pageRefreshes: 0, downloaded: 0, upToDate: 0, failures: [] };
  let cardsSeen = 0;

  for await (const page of pages) {
    stats.pages++;
    const failed = new Set<string>();
    let refreshes = 0;
    let downloaded = 0;
    // `Expires` is compared with the local clock, which may drift (WSL after sleep): once the page
    // has been fetched again, trust its URLs and rely on the server's 403 instead.
    let checkExpiry = true;
    const initialTodo = pending(page, deps.store, failed);
    stats.upToDate += countPrintings(page) - initialTodo.length;

    for (;;) {
      const todo = pending(page, deps.store, failed);
      if (todo.length === 0) break;

      let expired = false;
      for (const { label, printing } of todo) {
        if (checkExpiry && printing.imageExpiresAt !== null && Date.parse(printing.imageExpiresAt) - now() < EXPIRY_MARGIN_MS) {
          expired = true;
          break;
        }
        const result = await deps.download(printing);
        if (result.ok) {
          try {
            await deps.store.save(printing.id, printing.imageVersion, result.bytes);
            downloaded++;
          } catch (error) {
            failed.add(printing.id);
            stats.failures.push({ printingId: printing.id, label, reason: error instanceof Error ? error.message : String(error) });
          }
        } else if (result.expired) {
          expired = true;
          break;
        } else {
          failed.add(printing.id);
          stats.failures.push({ printingId: printing.id, label, reason: result.reason });
        }
      }
      if (!expired) break;

      if (refreshes >= MAX_REFRESHES_PER_PAGE) {
        for (const { label, printing } of pending(page, deps.store, failed)) {
          stats.failures.push({ printingId: printing.id, label, reason: "URL d'image expirée malgré le rechargement de la page" });
        }
        break;
      }
      await page.refresh();
      refreshes++;
      checkExpiry = false;
    }

    await deps.store.flush();
    stats.downloaded += downloaded;
    stats.pageRefreshes += refreshes;
    const first = cardsSeen + 1;
    cardsSeen += page.cards.length;
    log(
      `Cartes ${first}–${cardsSeen}/${page.total} : ${downloaded} images téléchargées` +
        (refreshes > 0 ? `, page rechargée ${refreshes}×` : "") +
        (failed.size > 0 ? `, ${failed.size} échecs` : ""),
    );
  }
  return stats;
}

function pending(page: SourcePage, store: CrawlDependencies["store"], failed: Set<string>) {
  return page.cards.flatMap((card) =>
    card.printings
      .filter((printing) => !failed.has(printing.id) && store.needs(printing))
      .map((printing) => ({ printing, label: `${card.name} [${printing.editionCode} ${printing.collectorNumber} ${printing.language}]` })),
  );
}

function countPrintings(page: SourcePage): number {
  return page.cards.reduce((sum, card) => sum + card.printings.length, 0);
}

async function main(): Promise<void> {
  const started = Date.now();
  const source = new NetdeckSource({ cacheDir: CACHE_DIR, refresh: process.argv.includes("--refresh") });
  const store = await ImageStore.open(IMAGES_DIR);
  const stats = await crawlImages(source.pages(), {
    download: (printing) => downloadImage(source.client, printing),
    store,
    log: console.log,
  });

  // The cache must now hold the complete, valid card list.
  const snapshot = await new NetdeckSource({ cacheDir: CACHE_DIR, offline: true }).fetchSnapshot();
  const printings = snapshot.cards.reduce((sum, card) => sum + card.printings.length, 0);
  const minutes = ((Date.now() - started) / 60_000).toFixed(1);
  console.log(`\n${snapshot.cards.length} cartes, ${printings} impressions, ${store.size} images en local`);
  console.log(
    `${stats.downloaded} images téléchargées, ${stats.upToDate} déjà à jour, ${stats.pageRefreshes} rechargements de page, ` +
      `${source.client.requestCount} requêtes HTTP en ${minutes} min`,
  );
  if (stats.failures.length > 0) {
    console.warn(`\n${stats.failures.length} images en échec (elles apparaîtront dans le rapport du build) :`);
    for (const failure of stats.failures) console.warn(`  ${failure.label} : ${failure.reason}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
