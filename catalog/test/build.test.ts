import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildCatalog, nextVersion, serialize, writeOutputs, type Manifest } from "../src/build.ts";
import { Report } from "../src/report.ts";
import { FETCHED_AT, loadSamplePage, snapshotFrom } from "./helpers.ts";

function buildSample() {
  const report = new Report();
  return { catalog: buildCatalog(snapshotFrom(loadSamplePage()), report), report };
}

describe("buildCatalog", () => {
  it("produces the spec's top-level structure, dated by the source", () => {
    const { catalog } = buildSample();
    expect(Object.keys(catalog)).toEqual([
      "schemaVersion", "generatedAt", "source", "languages", "sets", "releases", "rarities", "cards", "printings",
    ]);
    expect(catalog).toMatchObject({ schemaVersion: 1, generatedAt: FETCHED_AT, source: { name: "netdeck", fetchedAt: FETCHED_AT } });
  });

  it("serializes identically on every run", () => {
    expect(serialize(buildSample().catalog)).toBe(serialize(buildSample().catalog));
  });
});

describe("nextVersion", () => {
  const previous: Manifest = {
    schemaVersion: 1,
    version: "2026-10-26.1",
    hash: "sha256:aaa",
    generatedAt: "2026-10-26T08:51:42.015Z",
    counts: { cards: 1, printings: 1 },
  };

  it("starts at .1", () => {
    expect(nextVersion(undefined, "sha256:bbb", "2026-10-26T09:00:00.000Z")).toBe("2026-10-26.1");
  });

  it("keeps the version when the content is unchanged", () => {
    expect(nextVersion(previous, "sha256:aaa", "2026-11-02T09:00:00.000Z")).toBe("2026-10-26.1");
  });

  it("increments within the same day and restarts on a new day", () => {
    expect(nextVersion(previous, "sha256:bbb", "2026-10-26T18:00:00.000Z")).toBe("2026-10-26.2");
    expect(nextVersion(previous, "sha256:bbb", "2026-11-02T09:00:00.000Z")).toBe("2026-11-02.1");
  });
});

describe("writeOutputs", () => {
  let outDir: string | undefined;
  afterEach(async () => {
    if (outDir) await rm(outDir, { recursive: true, force: true });
  });

  it("writes the catalog, a manifest with its hash, and the report", async () => {
    outDir = await mkdtemp(join(tmpdir(), "nova-preem-build-"));
    const { catalog, report } = buildSample();
    const manifest = await writeOutputs(outDir, catalog, report);

    const catalogJson = await readFile(join(outDir, "catalog.json"), "utf8");
    expect(manifest.hash).toBe(`sha256:${createHash("sha256").update(catalogJson).digest("hex")}`);
    expect(manifest).toMatchObject({ version: "2026-10-26.1", counts: { cards: 9, printings: catalog.printings.length } });
    expect(JSON.parse(await readFile(join(outDir, "manifest.json"), "utf8"))).toEqual(manifest);

    const reportFile = JSON.parse(await readFile(join(outDir, "report.json"), "utf8"));
    expect(reportFile.anomalies).toEqual(report.anomalies);
    expect(reportFile.summary).toEqual(report.summary());
  });

  it("keeps the version on an identical rebuild and bumps it when the content changes", async () => {
    outDir = await mkdtemp(join(tmpdir(), "nova-preem-build-"));
    const first = await writeOutputs(outDir, buildSample().catalog, new Report());
    const firstJson = await readFile(join(outDir, "catalog.json"), "utf8");
    const second = await writeOutputs(outDir, buildSample().catalog, new Report());
    expect(second).toEqual(first);
    expect(await readFile(join(outDir, "catalog.json"), "utf8")).toBe(firstJson);

    const changed = buildSample().catalog;
    changed.cards[0]!.name.fr = "Autre nom";
    expect((await writeOutputs(outDir, changed, new Report())).version).toBe("2026-10-26.2");
  });

  it("refuses to write a catalog containing a signed URL", async () => {
    outDir = await mkdtemp(join(tmpdir(), "nova-preem-build-"));
    const { catalog, report } = buildSample();
    catalog.printings[0]!.image = { path: "https://cdn.example/x.webp?Expires=1&Signature=abc", thumbPath: "thumbs/x.webp", width: 1, height: 1 };
    await expect(writeOutputs(outDir, catalog, report)).rejects.toThrow(/signed URL/);
  });
});
