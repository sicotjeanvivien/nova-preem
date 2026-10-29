import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import { serveCatalog } from "./build/serve-catalog.ts";

const THEME_COLOR = "#0D0F14";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd());
  const catalogBase = env.VITE_CATALOG_BASE_URL ?? "/catalog/";
  return {
    plugins: [
      react(),
      // Only a same-origin, relative base can be served locally.
      ...(catalogBase.startsWith("/") ? [serveCatalog({ dir: "../catalog/dist", base: catalogBase })] : []),
      VitePWA({
        registerType: "autoUpdate",
        injectRegister: false,
        includeAssets: ["favicon.svg", "apple-touch-icon.png"],
        manifest: {
          id: "/",
          name: "Nova Preem",
          short_name: "Nova Preem",
          description: "Gérez votre collection de cartes, hors-ligne. Outil de fan, non officiel.",
          lang: "fr",
          dir: "ltr",
          start_url: "/",
          scope: "/",
          display: "standalone",
          orientation: "any",
          background_color: THEME_COLOR,
          theme_color: THEME_COLOR,
          categories: ["games", "utilities"],
          icons: [
            { src: "icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
            { src: "icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
            { src: "icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
          ],
        },
        workbox: {
          // The app shell (code, styles, fonts, icons) is precached. The catalog itself
          // is stored in IndexedDB by the app, so the service worker never caches it.
          globPatterns: ["**/*.{html,js,css,woff2,svg,png,webmanifest}"],
          navigateFallback: "index.html",
          // In production the catalog is on another origin, whose navigations the service worker never sees.
          navigateFallbackDenylist: catalogBase.startsWith("/") ? [new RegExp(`^${escapeRegExp(catalogBase)}`)] : [],
          cleanupOutdatedCaches: true,
          // Card images are cached as they are displayed (spec §6): an image seen once stays available offline.
          // Every card <img> is crossOrigin="anonymous", like the fetch() of the full download: the cache only
          // holds CORS responses, never opaque ones that a fetch() could not read.
          runtimeCaching: [
            {
              urlPattern: new RegExp(`${escapeRegExp(catalogBase)}images/`),
              handler: "CacheFirst",
              options: {
                cacheName: "card-images",
                expiration: { maxEntries: 3000 },
                cacheableResponse: { statuses: [200] },
              },
            },
          ],
        },
      }),
    ],
    // All addresses: WSL then forwards Windows' "localhost" (tried in IPv6 first) without delay.
    // Listening on 127.0.0.1 only made every request from Windows wait ~2 s.
    server: { host: true, port: 5173, strictPort: true },
    preview: { host: true, port: 4173, strictPort: true },
  };
});

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
