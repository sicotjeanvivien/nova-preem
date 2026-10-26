import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { z } from "zod";
import { PoliteClient } from "../http.ts";
import type { SourceCard, SourcePage, SourcePrinting, SourceSnapshot } from "./types.ts";

const API_BASE = "https://api.netdeck.gg/api/cards/cyberpunk";
/** The API silently caps `limit` at 100. Small pages leave time to download images before their URLs expire. */
export const DEFAULT_PAGE_SIZE = 20;

// Only the fields the pipeline uses are declared; unknown fields are dropped.
const printingSchema = z.object({
  id: z.string().min(1),
  collector_number: z.string().min(1),
  set: z.object({ code: z.string().min(1), name: z.string() }),
  rarity: z.string().min(1),
  language: z.string().min(2),
  localized_name: z.string().nullable(),
  printed_rules_text: z.string().nullable(),
  official_rules_text: z.string().nullable(),
  artist: z.string().nullable(),
  finish: z.string().nullable(),
  image_url: z.url(),
});

const cardSchema = z.object({
  id: z.string().min(1),
  slug: z.string().min(1),
  canonical_name: z.string().min(1),
  canonical_base_name: z.string().min(1),
  card_type: z.string().min(1),
  color: z.string().nullable(),
  classifications: z.array(z.string()),
  keywords: z.array(z.string()),
  cost: z.number().nullable(),
  power: z.number().nullable(),
  ram: z.number().nullable(),
  is_eddiable: z.boolean(),
  official_rules_text_en: z.string().nullable(),
  legality: z.string().min(1),
  printings: z.array(printingSchema),
});

const listPageSchema = z.object({
  items: z.array(cardSchema),
  total: z.number().int().nonnegative(),
  limit: z.number().int(),
  offset: z.number().int(),
});

export type NetdeckCard = z.infer<typeof cardSchema>;
export type NetdeckPrinting = z.infer<typeof printingSchema>;
export type NetdeckListPage = z.infer<typeof listPageSchema>;

export interface CachedResponse {
  url: string;
  fetchedAt: string;
  body: unknown;
}

export interface NetdeckOptions {
  cacheDir: string;
  /** Ignore the cache and download again. */
  refresh?: boolean;
  /** Never use the network: fail if a page is missing from the cache. */
  offline?: boolean;
  client?: PoliteClient;
}

/**
 * Source adapter for the (undocumented) Netdeck API. Raw responses are cached
 * on disk so that re-running the pipeline does not hit the API again.
 */
export class NetdeckSource {
  readonly client: PoliteClient;
  readonly #cacheDir: string;
  readonly #refresh: boolean;
  readonly #offline: boolean;

  constructor(options: NetdeckOptions) {
    this.#cacheDir = options.cacheDir;
    this.#refresh = options.refresh ?? false;
    this.#offline = options.offline ?? false;
    this.client = options.client ?? new PoliteClient();
  }

  /** Fetches (or reads from cache) every page of the card list and returns validated, source-neutral cards. */
  async fetchSnapshot(pageSize = DEFAULT_PAGE_SIZE): Promise<SourceSnapshot> {
    const pages: { fetchedAt: string; page: NetdeckListPage }[] = [];
    for await (const handle of this.#walk(pageSize)) pages.push(handle.loaded);
    return toSnapshot(pages);
  }

  /**
   * Iterates over the pages of the card list, for the crawl. Each page can be
   * downloaded again with `refresh()` to get fresh (short-lived) image URLs.
   */
  async *pages(pageSize = DEFAULT_PAGE_SIZE): AsyncGenerator<SourcePage> {
    for await (const handle of this.#walk(pageSize)) {
      yield {
        get cards() {
          return handle.loaded.cards;
        },
        get fetchedAt() {
          return handle.loaded.fetchedAt;
        },
        get total() {
          return handle.loaded.page.total;
        },
        refresh: () => handle.reload(),
      };
    }
  }

  async *#walk(pageSize: number): AsyncGenerator<{ loaded: LoadedPage; reload(): Promise<void> }> {
    let offset = 0;
    for (;;) {
      const pageOffset = offset;
      const handle = {
        loaded: await this.#loadPage(pageOffset, pageSize, false),
        reload: async () => {
          handle.loaded = await this.#loadPage(pageOffset, pageSize, true);
        },
      };
      yield handle;
      // Follow the page actually received (it may have been refreshed with another size).
      const { page } = handle.loaded;
      offset += page.items.length;
      if (page.items.length === 0 || offset >= page.total) return;
    }
  }

  /** Cached by offset only: pagination follows `items.length`, so pages of any size can be read back. */
  async #loadPage(offset: number, limit: number, force: boolean): Promise<LoadedPage> {
    const url = `${API_BASE}?limit=${limit}&offset=${offset}`;
    const response = await this.#getJson(url, `cards-offset${offset}.json`, force);
    const page = parseListPage(response.body, response.url);
    return { fetchedAt: response.fetchedAt, page, cards: page.items.map(toSourceCard) };
  }

  async #getJson(url: string, cacheName: string, force: boolean): Promise<CachedResponse> {
    const cachePath = join(this.#cacheDir, cacheName);
    if (!this.#refresh && !force) {
      const cached = await readJsonIfExists(cachePath);
      if (cached) return cached as CachedResponse;
    }
    if (this.#offline) throw new Error(`Netdeck: ${cachePath} is not in the cache, run the crawl first`);
    const response = await this.client.fetch(url, { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error(`Netdeck: HTTP ${response.status} for ${url}`);
    const entry: CachedResponse = { url, fetchedAt: new Date().toISOString(), body: await response.json() };
    await mkdir(this.#cacheDir, { recursive: true });
    await writeFile(cachePath, JSON.stringify(entry));
    return entry;
  }
}

interface LoadedPage {
  fetchedAt: string;
  page: NetdeckListPage;
  cards: SourceCard[];
}

/** Validates a raw list response. Throws with a readable message if the source format changed. */
export function parseListPage(body: unknown, origin = "list page"): NetdeckListPage {
  const result = listPageSchema.safeParse(body);
  if (!result.success) {
    throw new Error(`Netdeck: unexpected format in ${origin}\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}

/** Assembles validated pages into a snapshot, checking that the announced total was received. */
export function toSnapshot(pages: { fetchedAt: string; page: NetdeckListPage }[]): SourceSnapshot {
  const first = pages[0];
  if (!first) throw new Error("Netdeck: no page received");
  const total = first.page.total;
  const cards = pages.flatMap(({ page }) => page.items.map(toSourceCard));
  if (pages.some(({ page }) => page.total !== total)) {
    throw new Error("Netdeck: the announced total changed between pages, run the crawl again with --refresh");
  }
  if (cards.length !== total) {
    throw new Error(`Netdeck: received ${cards.length} cards but the source announces ${total}`);
  }
  const fetchedAt = pages.map((p) => p.fetchedAt).reduce((a, b) => (a > b ? a : b));
  return { source: "netdeck", fetchedAt, total, cards };
}

export function toSourceCard(card: NetdeckCard): SourceCard {
  return {
    id: card.id,
    slug: card.slug,
    name: card.canonical_name,
    baseName: card.canonical_base_name,
    type: card.card_type,
    color: card.color,
    classifications: card.classifications,
    keywords: card.keywords,
    cost: card.cost,
    power: card.power,
    ram: card.ram,
    eddiable: card.is_eddiable,
    rulesText: card.official_rules_text_en,
    legality: card.legality,
    printings: card.printings.map(toSourcePrinting),
  };
}

function toSourcePrinting(printing: NetdeckPrinting): SourcePrinting {
  return {
    id: printing.id,
    collectorNumber: printing.collector_number,
    editionCode: printing.set.code,
    editionName: printing.set.name,
    rarity: printing.rarity,
    language: printing.language,
    localizedName: printing.localized_name,
    printedRulesText: printing.printed_rules_text,
    officialRulesText: printing.official_rules_text,
    artist: printing.artist,
    finish: printing.finish,
    imageUrl: printing.image_url,
    imageVersion: basename(new URL(printing.image_url).pathname),
    imageExpiresAt: signatureExpiry(printing.image_url),
  };
}

/** Expiry of a CloudFront signed URL (`Expires` = Unix time in seconds), or null if the URL is not signed. */
function signatureExpiry(url: string): string | null {
  const expires = Number(new URL(url).searchParams.get("Expires"));
  return Number.isFinite(expires) && expires > 0 ? new Date(expires * 1000).toISOString() : null;
}

async function readJsonIfExists(path: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}
