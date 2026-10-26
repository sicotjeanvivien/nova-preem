import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { ImageStore, attachImages } from "./images.ts";
import type { Catalog } from "./model.ts";
import { normalize } from "./normalize.ts";
import { Report, type Anomaly } from "./report.ts";
import { NetdeckSource } from "./sources/netdeck.ts";
import type { SourceSnapshot } from "./sources/types.ts";
import { CACHE_DIR, DIST_DIR, IMAGES_DIR } from "./paths.ts";

export interface Manifest {
  schemaVersion: 1;
  /** "YYYY-MM-DD.N": changes only when the catalog content changes. */
  version: string;
  hash: string;
  generatedAt: string;
  counts: { cards: number; printings: number };
}

export interface ReportFile {
  schemaVersion: 1;
  generatedAt: string;
  summary: ReturnType<Report["summary"]>;
  anomalies: Anomaly[];
}

/**
 * Builds the catalog from a source snapshot. The result depends only on the
 * snapshot: `generatedAt` is the time the data was fetched, not the build time,
 * so two builds on the same cache produce identical files.
 */
export function buildCatalog(snapshot: SourceSnapshot, report: Report, images?: ImageStore): Catalog {
  const catalog: Catalog = {
    schemaVersion: 1,
    generatedAt: snapshot.fetchedAt,
    source: { name: snapshot.source, fetchedAt: snapshot.fetchedAt },
    ...normalize(snapshot, report),
  };
  if (images) attachImages(catalog.printings, snapshot, images, report);
  return catalog;
}

export function serialize(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

/** Keeps the previous version if the content is unchanged, otherwise increments it within the day. */
export function nextVersion(previous: Manifest | undefined, hash: string, generatedAt: string): string {
  if (previous?.hash === hash) return previous.version;
  const day = generatedAt.slice(0, 10);
  const [previousDay, previousIndex] = previous?.version.split(".") ?? [];
  return previousDay === day ? `${day}.${Number(previousIndex) + 1}` : `${day}.1`;
}

/** Writes catalog.json, manifest.json and report.json. */
export async function writeOutputs(outDir: string, catalog: Catalog, report: Report): Promise<Manifest> {
  const catalogJson = serialize(catalog);
  // Signed image URLs expire within minutes and must never end up in the catalog.
  if (/[?&](Signature|Expires|Key-Pair-Id)=/.test(catalogJson)) throw new Error("The catalog contains a signed URL");

  const hash = `sha256:${createHash("sha256").update(catalogJson).digest("hex")}`;
  const previous = await readManifest(join(outDir, "manifest.json"));
  const manifest: Manifest = {
    schemaVersion: 1,
    version: nextVersion(previous, hash, catalog.generatedAt),
    hash,
    generatedAt: catalog.generatedAt,
    counts: { cards: catalog.cards.length, printings: catalog.printings.length },
  };
  const reportFile: ReportFile = {
    schemaVersion: 1,
    generatedAt: catalog.generatedAt,
    summary: report.summary(),
    anomalies: report.anomalies,
  };

  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, "catalog.json"), catalogJson);
  await writeFile(join(outDir, "manifest.json"), serialize(manifest));
  await writeFile(join(outDir, "report.json"), serialize(reportFile));
  return manifest;
}

async function readManifest(path: string): Promise<Manifest | undefined> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as Manifest;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

function printSummary(catalog: Catalog, manifest: Manifest, report: Report): void {
  console.log(`Catalogue ${manifest.version} (${manifest.hash.slice(0, 19)}…), données du ${catalog.source.fetchedAt}`);
  console.log(
    `  ${catalog.cards.length} cartes, ${catalog.printings.length} impressions, ${catalog.releases.length} releases, langues : ${catalog.languages.join(", ")}`,
  );
  console.log(`  Images : ${catalog.printings.filter((p) => p.image).length}/${catalog.printings.length}`);
  const summary = report.summary();
  if (summary.length === 0) {
    console.log("  Aucune anomalie.");
    return;
  }
  const count = (severity: string) => summary.filter((s) => s.severity === severity).reduce((sum, s) => sum + s.count, 0);
  console.log(`  Anomalies : ${count("warning")} avertissements, ${count("info")} informations (détail dans dist/report.json)`);
  for (const { code, severity, count } of summary) console.log(`    ${severity === "warning" ? "⚠" : "·"} ${code} : ${count}`);
}

async function main(): Promise<void> {
  const snapshot = await new NetdeckSource({ cacheDir: CACHE_DIR, offline: true }).fetchSnapshot();
  const report = new Report();
  const catalog = buildCatalog(snapshot, report, await ImageStore.open(IMAGES_DIR));
  const manifest = await writeOutputs(DIST_DIR, catalog, report);
  printSummary(catalog, manifest, report);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
