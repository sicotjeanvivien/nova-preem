// The `pnpm prices` command: downloads the two Cardmarket files, matches them to
// the catalog and writes prices.json and prices-report.json (docs/prices-spec.md).
//   pnpm prices            downloads the files (two requests) into .cache/cardmarket/
//   pnpm prices --offline  uses the files downloaded last time

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { serialize } from "../build.ts";
import type { Catalog } from "../model.ts";
import { CATALOG_ROOT, DIST_DIR } from "../paths.ts";
import { loadMarketFiles, parseMarketFiles } from "./cardmarket.ts";
import { loadMapping } from "./mapping.ts";
import { matchPrices } from "./match.ts";
import { type PricesFile, pricesFile, type PricesReportFile } from "./output.ts";

export const MARKET_CACHE_DIR = join(CATALOG_ROOT, ".cache", "cardmarket");
/** Not in git: the prices change every night. */
export const PRICES_DIST_DIR = join(CATALOG_ROOT, "prices", "dist");

export async function buildPrices(options: { offline: boolean; generatedAt?: string }): Promise<{ file: PricesFile; report: PricesReportFile }> {
  const catalog = JSON.parse(await readFile(join(DIST_DIR, "catalog.json"), "utf8")) as Catalog;
  const { version: catalogVersion } = JSON.parse(await readFile(join(DIST_DIR, "manifest.json"), "utf8")) as { version: string };
  const mapping = await loadMapping(catalog);
  const raw = await loadMarketFiles(MARKET_CACHE_DIR, mapping.game, options.offline);
  const market = parseMarketFiles(raw.products, raw.prices, mapping.category);
  const result = matchPrices(catalog, market, mapping);
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const file = pricesFile(result, { sourceDate: market.pricesDate, generatedAt, catalogVersion });
  const report: PricesReportFile = {
    schemaVersion: 1,
    generatedAt,
    catalogVersion,
    productsDate: market.productsDate,
    pricesDate: market.pricesDate,
    ...result.report,
  };
  return { file, report };
}

function printSummary({ file, report }: { file: PricesFile; report: PricesReportFile }): void {
  const s = report.summary;
  console.log(`Prix Cardmarket du ${report.pricesDate} (produits du ${report.productsDate}), catalogue ${report.catalogVersion}`);
  console.log(`  Variantes rattachées : ${s.matched}/${s.variants} (${(s.coverage * 100).toFixed(1)} %), dont ${s.withPrice} avec un prix et ${s.withoutPrice} sans`);
  console.log(`  Groupes de même nom rattachés dans l'ordre : ${s.duplicateGroups}`);
  const line = (label: string, count: number) => console.log(`  ${count > 0 ? "⚠" : "·"} ${label} : ${count}`);
  line("tirages sans extension", report.releasesWithoutExpansion.length);
  line("extensions sans produit", report.expansionsWithoutProducts.length);
  line("noms non rattachés", report.unmatchedNames.length);
  line("produits orphelins", report.orphanProducts.length);
  line("contrôles Iconic en échec", report.iconicCheckFailures.length);
  for (const alias of report.aliases) console.log(`  · alias « ${alias.from} » → « ${alias.to} » : ${alias.products} produit(s)`);
  if (report.overrides.length > 0) console.log(`  · corrections manuelles : ${report.overrides.length}`);
  console.log(`  prices.json : ${Object.keys(file.prices).length} prix (détail dans prices/dist/prices-report.json)`);
}

async function main(): Promise<void> {
  const built = await buildPrices({ offline: process.argv.includes("--offline") });
  await mkdir(PRICES_DIST_DIR, { recursive: true });
  await writeFile(join(PRICES_DIST_DIR, "prices.json"), `${JSON.stringify(built.file)}\n`);
  await writeFile(join(PRICES_DIST_DIR, "prices-report.json"), serialize(built.report));
  printSummary(built);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
