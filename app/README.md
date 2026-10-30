# Nova Preem app

The collection app: a Progressive Web App, offline first, built with Vite, React 19, TypeScript, Dexie (IndexedDB), Zod and React Router.

Behavior and rules are specified in [`docs/app-spec.md`](../docs/app-spec.md) (in French) and [`docs/sync-spec.md`](../docs/sync-spec.md) for the Google Drive sync. The design mockups are in [`docs/mockups/`](../docs/mockups/).

## Requirements

- Node 22 or later
- pnpm

## Commands

```bash
pnpm install
pnpm dev        # development server, http://localhost:5173 (no service worker)
pnpm test       # Vitest: domain rules, IndexedDB storage (simulated), screen rendering
pnpm typecheck  # types of the app, the domain on its own, and the build scripts
pnpm build      # typecheck, then production build in dist/
pnpm preview    # serves the production build, http://localhost:4173 (with service worker)
pnpm icons      # regenerates the icons in public/ (sharp)
```

## Catalog

The catalog is not bundled into the app: the app downloads `manifest.json` and `catalog.json` at first launch, stores them in IndexedDB, and checks the manifest for updates at each launch.

- In development and preview, `/catalog/` is served from `../catalog/dist/` (see [`build/serve-catalog.ts`](build/serve-catalog.ts)). The JSON files are committed; the card images only exist after you run the pipeline in [`catalog/`](../catalog/README.md). Without them, cards show a neutral placeholder.
- In production, the catalog is a separate site on another origin. Images are loaded with CORS.

## Configuration

Environment variables, read at build time. Defaults are in [`.env`](.env); put local values in `.env.local` (ignored by git).

| Variable | Purpose | Default |
|---|---|---|
| `VITE_CATALOG_BASE_URL` | Base URL of `catalog.json`, `manifest.json` and `images/`, with a trailing slash | `/catalog/` |
| `VITE_GOOGLE_CLIENT_ID` | Google OAuth client ID for the Drive sync. Public value, no secret. Empty: sync is off. | empty |

Setting up the Google project: [`docs/deploy.md`](../docs/deploy.md).

## Code layout

```
src/domain/     rules, types and Zod schemas; pure: no React, no Dexie, no browser API
src/storage/    Dexie implementations of the CatalogStore, CollectionStore and SettingsStore interfaces
src/platform/   browser services: HTTP, hashing, connectivity, service worker, Google sign-in and Drive
src/i18n/       interface strings, French and English
src/ui/         React: layout, screens, styles (CSS variables in ui/styles/tokens.css)
test/           Vitest, mirroring src/ (domain, storage, ui)
```

Two rules keep the app portable to a native shell later (spec §9.1):

1. **The domain is pure.** `src/domain/` imports neither React, Dexie nor any browser API. This is checked twice: `tsconfig.domain.json` compiles it without the DOM types, and `test/domain/purity.test.ts` checks its imports.
2. **Storage sits behind interfaces.** Screens and rules use `CatalogStore`, `CollectionStore` and `SettingsStore`; Dexie is only one implementation.

## Collection file

Export, import and the Drive sync share one JSON format (`nova-preem/collection`, schema version 1): printing IDs, quantities, dates and settings, sorted by printing ID. See spec §4.3.

## Deployment

The CI (`.github/workflows/ci.yml`) tests and builds on every push, and deploys `dist/` to Cloudflare Pages on each push to `main`. Details: [`docs/deploy.md`](../docs/deploy.md).

## Testing on an Android phone (USB)

1. On the phone, enable the developer options and **USB debugging**, plug the cable in and accept the computer's key.
2. On the computer, in Chrome: open `chrome://inspect/#devices` and check **Discover USB devices**. The phone appears.
3. **Port forwarding**: `4173` → `localhost:4173` (and `5173` → `localhost:5173` for development). On Windows with WSL 2, `localhost` is forwarded to WSL.
4. Run `pnpm build && pnpm preview`.
5. On the phone, in Chrome, open `http://localhost:4173`. Chrome treats `localhost` as secure, so the service worker and installation work without HTTPS.
6. Menu ⋮ → **Install app** (or **Add to Home screen**).
