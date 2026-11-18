// The `pnpm publish-prices` command (docs/prices-spec.md §4, Publication): checks
// prices/dist/ and deploys prices.json to its own Cloudflare Pages project.
// It refuses to publish, and fails, when the file is invalid or when the
// coverage falls under 80 % of the previous publication: the file online stays.
//   pnpm publish-prices [--previous <prices-report.json>] [--dry-run]

import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";
import { CATALOG_ROOT } from "../paths.ts";
import { deploy } from "../publish.ts";
import { PRICES_DIST_DIR } from "./build.ts";
import type { PricesReportFile } from "./output.ts";
import { validatePricesFile } from "./output.ts";

const DEFAULT_PROJECT = "nova-preem-prices";
const STAGING_DIR = join(CATALOG_ROOT, ".cache", "publish-prices");
/** Minimum share of the variants matched by the previous publication. */
export const MIN_COVERAGE_RATIO = 0.8;

/** CORS open (the app is on another origin); one hour of cache, the file changes every night. */
export const PRICES_HEADERS = `/*
  Access-Control-Allow-Origin: *
  Cache-Control: public, max-age=3600
  X-Content-Type-Options: nosniff
`;

type Summary = Pick<PricesReportFile["summary"], "matched">;

/**
 * Coverage guard: the variants matched now must be at least 80 % of those
 * matched by the previous publication. Returns the reason to refuse, or null.
 */
export function coverageProblem(current: Summary, previous: Summary | null): string | null {
  if (!previous) return null;
  const minimum = Math.ceil(previous.matched * MIN_COVERAGE_RATIO);
  if (current.matched >= minimum) return null;
  return `couverture en chute : ${current.matched} variantes rattachées, contre ${previous.matched} à la publication précédente (minimum ${minimum})`;
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8"));
}

async function readPrevious(path: string | undefined): Promise<Summary | null> {
  if (!path) return null;
  try {
    const report = (await readJson(path)) as Partial<PricesReportFile>;
    const matched = report.summary?.matched;
    if (typeof matched !== "number") throw new Error(`${path} : rapport précédent sans summary.matched`);
    return { matched };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function main(): Promise<void> {
  const { values } = parseArgs({ options: { previous: { type: "string" }, "dry-run": { type: "boolean", default: false } } });
  const file = validatePricesFile(await readJson(join(PRICES_DIST_DIR, "prices.json")));
  const report = (await readJson(join(PRICES_DIST_DIR, "prices-report.json"))) as PricesReportFile;
  if (report.pricesDate !== file.sourceDate) throw new Error("prices.json et prices-report.json ne viennent pas du même calcul");

  const previous = await readPrevious(values.previous);
  if (!previous) console.warn("Pas de rapport de la publication précédente : contrôle de couverture sauté.");
  const problem = coverageProblem(report.summary, previous);
  if (problem) throw new Error(`Prix non publiés, ${problem}`);

  await rm(STAGING_DIR, { recursive: true, force: true });
  await mkdir(STAGING_DIR, { recursive: true });
  await writeFile(join(STAGING_DIR, "prices.json"), `${JSON.stringify(file)}\n`);
  await writeFile(join(STAGING_DIR, "_headers"), PRICES_HEADERS);

  const project = process.env.PRICES_PROJECT ?? DEFAULT_PROJECT;
  const count = Object.keys(file.prices).length;
  console.log(`Prix du ${file.sourceDate} : ${count} prix, ${report.summary.matched} variantes rattachées${previous ? ` (précédemment ${previous.matched})` : ""}`);
  if (values["dry-run"]) {
    console.log(`--dry-run : rien n'est publié (fichiers prêts dans ${STAGING_DIR})`);
    return;
  }
  console.log(`Publication sur le projet Cloudflare Pages « ${project} »`);
  await deploy(project, STAGING_DIR);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
