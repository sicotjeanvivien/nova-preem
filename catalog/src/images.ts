import { access, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import { z } from "zod";
import type { PoliteClient } from "./http.ts";
import type { Printing } from "./model.ts";
import type { Report } from "./report.ts";
import type { SourcePrinting, SourceSnapshot } from "./sources/types.ts";

export const THUMB_WIDTH = 256;
const THUMBS_DIR = "thumbs";
const INDEX_FILE = "index.json";

export interface ImageRecord {
  /** Source image identifier the local files were made from. */
  version: string;
  width: number;
  height: number;
}

const indexSchema = z.object({
  schemaVersion: z.literal(1),
  images: z.record(z.string(), z.object({ version: z.string(), width: z.number(), height: z.number() })),
});

/**
 * Local image storage: `{printingId}.webp`, `thumbs/{printingId}.webp`, and an
 * index recording which source version each image was made from, so that an
 * image is downloaded again only when the art changes.
 */
export class ImageStore {
  readonly dir: string;
  readonly #records: Map<string, ImageRecord>;

  private constructor(dir: string, records: Map<string, ImageRecord>) {
    this.dir = dir;
    this.#records = records;
  }

  /** Opens the store, forgetting index entries whose files have disappeared. */
  static async open(dir: string): Promise<ImageStore> {
    let records = new Map<string, ImageRecord>();
    try {
      const index = indexSchema.parse(JSON.parse(await readFile(join(dir, INDEX_FILE), "utf8")));
      records = new Map(Object.entries(index.images));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    const store = new ImageStore(dir, records);
    for (const id of [...records.keys()]) {
      if (!(await exists(store.imagePath(id))) || !(await exists(store.thumbPath(id)))) records.delete(id);
    }
    return store;
  }

  get(printingId: string): ImageRecord | undefined {
    return this.#records.get(printingId);
  }

  get size(): number {
    return this.#records.size;
  }

  /** True if the image is missing or was made from another version of the source art. */
  needs(printing: SourcePrinting): boolean {
    return this.#records.get(printing.id)?.version !== printing.imageVersion;
  }

  /** Stores a downloaded image and its thumbnail (both WebP). */
  async save(printingId: string, version: string, bytes: Buffer): Promise<ImageRecord> {
    const metadata = await sharp(bytes).metadata();
    if (!metadata.width || !metadata.height) throw new Error(`Image ${printingId}: unreadable dimensions`);
    const full = metadata.format === "webp" ? bytes : await sharp(bytes).webp({ quality: 90 }).toBuffer();
    const thumb = await sharp(bytes).resize({ width: THUMB_WIDTH, withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();

    await mkdir(join(this.dir, THUMBS_DIR), { recursive: true });
    await writeAtomically(this.imagePath(printingId), full);
    await writeAtomically(this.thumbPath(printingId), thumb);
    const record = { version, width: metadata.width, height: metadata.height };
    this.#records.set(printingId, record);
    return record;
  }

  /** Writes the index (sorted, so that it is stable). */
  async flush(): Promise<void> {
    const images = Object.fromEntries([...this.#records].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
    await mkdir(this.dir, { recursive: true });
    await writeAtomically(join(this.dir, INDEX_FILE), `${JSON.stringify({ schemaVersion: 1, images }, null, 2)}\n`);
  }

  imagePath(printingId: string): string {
    return join(this.dir, relativeImagePath(printingId));
  }

  thumbPath(printingId: string): string {
    return join(this.dir, relativeThumbPath(printingId));
  }
}

export type DownloadResult = { ok: true; bytes: Buffer } | { ok: false; expired: boolean; reason: string };

/** Downloads a printing's image. A 403 means the signed URL has expired. */
export async function downloadImage(client: PoliteClient, printing: SourcePrinting): Promise<DownloadResult> {
  const response = await client.fetch(printing.imageUrl);
  if (!response.ok) {
    await response.body?.cancel();
    return { ok: false, expired: response.status === 403, reason: `HTTP ${response.status}` };
  }
  const type = response.headers.get("content-type") ?? "";
  if (!type.startsWith("image/")) {
    await response.body?.cancel();
    return { ok: false, expired: false, reason: `unexpected content type "${type}"` };
  }
  return { ok: true, bytes: Buffer.from(await response.arrayBuffer()) };
}

/**
 * Fills `printing.image` from the local store. Every printing ends up with an
 * image or an anomaly in the report (missing, or made from an older art).
 */
export function attachImages(printings: Printing[], snapshot: SourceSnapshot, store: ImageStore, report: Report): void {
  const sources = new Map(snapshot.cards.flatMap((card) => card.printings.map((printing) => [printing.id, { card, printing }] as const)));
  for (const printing of printings) {
    const record = store.get(printing.id);
    const source = sources.get(printing.id);
    const context = { cardId: printing.cardId, printingId: printing.id, sourceCode: printing.sourceCode, collectorNumber: printing.collectorNumber, language: printing.language };
    const label = `${source?.card.name ?? printing.cardId} [${printing.sourceCode} ${printing.collectorNumber} ${printing.language}]`;
    if (!record) {
      report.warn("missing-image", `${label} : pas d'image locale (lancer pnpm crawl)`, context);
      continue;
    }
    printing.image = {
      path: relativeImagePath(printing.id),
      thumbPath: relativeThumbPath(printing.id),
      width: record.width,
      height: record.height,
    };
    if (source && record.version !== source.printing.imageVersion) {
      report.warn("outdated-image", `${label} : l'illustration a changé à la source (lancer pnpm crawl)`, context);
    }
  }
}

function relativeImagePath(printingId: string): string {
  return `${printingId}.webp`;
}

function relativeThumbPath(printingId: string): string {
  return `${THUMBS_DIR}/${printingId}.webp`;
}

async function writeAtomically(path: string, data: Buffer | string): Promise<void> {
  const temporary = `${path}.tmp`;
  await writeFile(temporary, data);
  await rename(temporary, path);
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
