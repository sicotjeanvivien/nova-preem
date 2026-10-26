import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CATALOG_ROOT = fileURLToPath(new URL("..", import.meta.url));
export const CACHE_DIR = join(CATALOG_ROOT, ".cache", "netdeck");
export const DIST_DIR = join(CATALOG_ROOT, "dist");
export const IMAGES_DIR = join(DIST_DIR, "images");
