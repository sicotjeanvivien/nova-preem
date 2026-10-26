import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { extname, resolve, sep } from "node:path";
import type { Connect, Plugin } from "vite";

const CONTENT_TYPES: Record<string, string> = {
  ".json": "application/json; charset=utf-8",
  ".webp": "image/webp",
};

/**
 * Serves the catalog produced by the pipeline (catalog/dist/) under `base`,
 * in development and in `vite preview`. In production the catalog lives on its
 * own host (VITE_CATALOG_BASE_URL), so it is never copied into the app build.
 */
export function serveCatalog(options: { dir: string; base: string }): Plugin {
  const root = resolve(options.dir);
  const middleware: Connect.NextHandleFunction = (req, res, next) => {
    void handle(req, res, next);
  };

  async function handle(req: IncomingMessage, res: ServerResponse, next: Connect.NextFunction) {
    const pathname = decodeURIComponent(new URL(req.url ?? "/", "http://localhost").pathname);
    if (!pathname.startsWith(options.base) || (req.method !== "GET" && req.method !== "HEAD")) return next();
    const file = resolve(root, pathname.slice(options.base.length));
    const type = CONTENT_TYPES[extname(file)];
    if (!file.startsWith(root + sep) || !type) return notFound(res);
    try {
      const info = await stat(file);
      if (!info.isFile()) return notFound(res);
      res.writeHead(200, { "Content-Type": type, "Content-Length": info.size, "Cache-Control": "no-cache" });
      if (req.method === "HEAD") res.end();
      else createReadStream(file).pipe(res);
    } catch {
      notFound(res);
    }
  }

  return {
    name: "nova-preem:serve-catalog",
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    },
  };
}

function notFound(res: ServerResponse) {
  res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("Not found");
}
