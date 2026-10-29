import { spawn } from "node:child_process";
import { access, copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import type { Catalog } from "./model.ts";
import { CATALOG_ROOT, DIST_DIR } from "./paths.ts";

/** Pinned so that a publish never depends on whatever wrangler is current that day. */
const WRANGLER = "wrangler@4.155.0";
const DEFAULT_PROJECT = "nova-preem-catalog";
const STAGING_DIR = join(CATALOG_ROOT, ".cache", "publish");

/**
 * Cloudflare Pages headers. The app lives on another origin, so everything is
 * CORS-enabled: the app fetches the JSON files and downloads images with fetch().
 * The JSON files keep the Pages default (revalidated on each request); images
 * keep their path when the art changes upstream, so they are not immutable.
 */
export const HEADERS = `/*
  Access-Control-Allow-Origin: *
  X-Content-Type-Options: nosniff

/images/*
  Cache-Control: public, max-age=86400
`;

/** Files to publish, relative to dist/: the JSON files and the images the catalog references. */
export function publishedFiles(catalog: Catalog): string[] {
  const images = catalog.printings.flatMap((printing) =>
    printing.image ? [`images/${printing.image.path}`, `images/${printing.image.thumbPath}`] : [],
  );
  return ["manifest.json", "catalog.json", ...new Set(images)];
}

async function stage(files: readonly string[]): Promise<void> {
  const missing: string[] = [];
  await Promise.all(files.map((file) => access(join(DIST_DIR, file)).catch(() => missing.push(file))));
  if (missing.length > 0) {
    throw new Error(`${missing.length} fichier(s) absent(s) de dist/, dont ${missing.slice(0, 3).join(", ")} : relancer pnpm crawl && pnpm build`);
  }
  await rm(STAGING_DIR, { recursive: true, force: true });
  for (const file of files) {
    await mkdir(dirname(join(STAGING_DIR, file)), { recursive: true });
    await copyFile(join(DIST_DIR, file), join(STAGING_DIR, file));
  }
  await writeFile(join(STAGING_DIR, "_headers"), HEADERS);
}

function deploy(project: string): Promise<void> {
  const args = ["dlx", WRANGLER, "pages", "deploy", STAGING_DIR, `--project-name=${project}`, "--branch=main", "--commit-dirty=true"];
  return new Promise((resolve, reject) => {
    const child = spawn("pnpm", args, { stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`wrangler a échoué (code ${code})`))));
  });
}

async function main(): Promise<void> {
  const catalog = JSON.parse(await readFile(join(DIST_DIR, "catalog.json"), "utf8")) as Catalog;
  const manifest = JSON.parse(await readFile(join(DIST_DIR, "manifest.json"), "utf8")) as { version: string };
  const files = publishedFiles(catalog);
  await stage(files);
  const project = process.env.CATALOG_PROJECT ?? DEFAULT_PROJECT;
  console.log(`Publication du catalogue ${manifest.version} (${files.length} fichiers) sur le projet Cloudflare Pages « ${project} »`);
  await deploy(project);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
