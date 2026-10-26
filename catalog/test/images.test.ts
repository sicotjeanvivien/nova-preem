import { mkdtemp, readFile, rm, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildCatalog } from "../src/build.ts";
import { ImageStore, THUMB_WIDTH } from "../src/images.ts";
import { Report } from "../src/report.ts";
import { loadSamplePage, snapshotFrom } from "./helpers.ts";

function cardImage(format: "webp" | "png"): Promise<Buffer> {
  return sharp({ create: { width: 733, height: 1024, channels: 3, background: "#46e3c8" } })[format]().toBuffer();
}

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "nova-preem-images-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("ImageStore", () => {
  it("stores the image, a 256 px thumbnail and its source version", async () => {
    const store = await ImageStore.open(dir);
    const record = await store.save("p1", "render-abc.webp", await cardImage("webp"));
    expect(record).toEqual({ version: "render-abc.webp", width: 733, height: 1024 });

    const thumb = await sharp(await readFile(join(dir, "thumbs", "p1.webp"))).metadata();
    expect(thumb).toMatchObject({ format: "webp", width: THUMB_WIDTH, height: 358 });
    expect((await sharp(await readFile(join(dir, "p1.webp"))).metadata()).format).toBe("webp");
  });

  it("converts a non-WebP source image to WebP", async () => {
    const store = await ImageStore.open(dir);
    await store.save("p1", "render-abc.png", await cardImage("png"));
    expect((await sharp(await readFile(join(dir, "p1.webp"))).metadata()).format).toBe("webp");
  });

  it("needs an image only when it is missing or the source art changed", async () => {
    const store = await ImageStore.open(dir);
    const printing = { id: "p1", imageVersion: "render-abc.webp" } as Parameters<ImageStore["needs"]>[0];
    expect(store.needs(printing)).toBe(true);
    await store.save("p1", "render-abc.webp", await cardImage("webp"));
    expect(store.needs(printing)).toBe(false);
    expect(store.needs({ ...printing, imageVersion: "render-def.webp" })).toBe(true);
  });

  it("persists its index and forgets images whose files were deleted", async () => {
    const store = await ImageStore.open(dir);
    await store.save("p1", "v1", await cardImage("webp"));
    await store.save("p2", "v2", await cardImage("webp"));
    await store.flush();
    expect((await ImageStore.open(dir)).get("p2")).toEqual({ version: "v2", width: 733, height: 1024 });

    await unlink(join(dir, "thumbs", "p2.webp"));
    const reopened = await ImageStore.open(dir);
    expect(reopened.size).toBe(1);
    expect(reopened.get("p2")).toBeUndefined();
  });
});

describe("attachImages (through buildCatalog)", () => {
  it("gives each printing a local image, or reports it as missing or outdated", async () => {
    const snapshot = snapshotFrom(loadSamplePage());
    const [first, second] = snapshot.cards[0]!.printings;
    const store = await ImageStore.open(dir);
    await store.save(first!.id, first!.imageVersion, await cardImage("webp"));
    await store.save(second!.id, "render-old.webp", await cardImage("webp"));

    const report = new Report();
    const catalog = buildCatalog(snapshot, report, store);
    const byId = new Map(catalog.printings.map((p) => [p.id, p]));
    expect(byId.get(first!.id)!.image).toEqual({ path: `${first!.id}.webp`, thumbPath: `thumbs/${first!.id}.webp`, width: 733, height: 1024 });
    expect(byId.get(second!.id)!.image).not.toBeNull();

    expect(report.byCode("outdated-image").map((a) => a.context.printingId)).toEqual([second!.id]);
    const missing = report.byCode("missing-image");
    expect(missing).toHaveLength(catalog.printings.length - 2);
    expect(catalog.printings.filter((p) => p.image === null)).toHaveLength(missing.length);
  });
});
