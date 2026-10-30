# Nova Preem catalog

The pipeline that builds the card catalog used by the app: every set, release, card and printing of the Cyberpunk TCG, in English and French, with their images. It is written in Node and TypeScript, and validates its input with Zod.

The full specification, including the data source, the normalization rules and the observations on the real data, is in [`docs/catalog-spec.md`](../docs/catalog-spec.md) (in French).

## Requirements

- Node 22 or later
- pnpm

## Commands

```bash
pnpm install
pnpm crawl            # downloads the card data and the missing or changed images
pnpm crawl --refresh  # same, ignoring the cached responses
pnpm build            # builds dist/ from the cache, without network
pnpm test             # Vitest, on fixtures taken from real API responses
pnpm typecheck
pnpm publish-catalog  # deploys dist/ to Cloudflare Pages (maintainer only)
```

A full update is `pnpm crawl && pnpm build`, then `pnpm publish-catalog` to put it online. The app sees the new version through `manifest.json` and offers the update.

## Data source

The official card database is provided by Netdeck.gg, through a **public but undocumented and unofficial** JSON API. Be polite to it:

- Requests are sequential, at most one per second, with an identifiable User-Agent (`nova-preem-catalog/<version> (+https://github.com/sicotjeanvivien/nova-preem)`), and retried with a growing delay on 429 and 5xx responses ([`src/http.ts`](src/http.ts)).
- Raw responses are cached in `.cache/` (ignored by git). Only use `--refresh` when you need fresh data, and do not crawl more than once a week.
- Image URLs are signed and expire within minutes, so the crawl works page by page: it fetches 20 cards, then downloads their images right away, and fetches the page again if the URLs have expired.

All access to the source goes through one adapter, [`src/sources/netdeck.ts`](src/sources/netdeck.ts), which returns validated objects in a neutral format. When Netdeck publishes an official API, only the adapter should change. If the source changes its format, the pipeline fails with a clear error instead of producing a broken catalog.

## Output

Everything is written to `dist/`:

| File | Content | In git |
|---|---|---|
| `catalog.json` | sets, releases, rarities, cards and printings | yes |
| `manifest.json` | catalog version (`YYYY-MM-DD.N`), content hash, counts | yes |
| `report.json` | anomalies found in the source data | yes |
| `images/{printingId}.webp` | full card images (733×1024) | no |
| `images/thumbs/{printingId}.webp` | 256 px wide thumbnails for the grids | no |

The build is deterministic: the same cache gives the same files, and the version only changes when the content changes.

Main concepts (spec §3): a **set** (Welcome to Night City) has **releases** (Retail, Beta, starters, demos, promos), each in a group (`main`, `starter`, `demo`, `promo`). A **card** has **printings**: one per release, collector number and language. Printing IDs are the source's UUIDs; the app's collection only references those.

## Anomalies

The source data is not perfect: missing French counterparts, collector numbers out of pattern, divergent texts between printings. The pipeline never guesses: an English and a French printing are only matched when the rules of the spec say so, and everything else is listed in `report.json` and summarized at the end of the build.

## Code layout

```
src/sources/types.ts    neutral source format: the rest of the pipeline only knows this
src/sources/netdeck.ts  adapter: pagination, cache, Zod validation, conversion
src/http.ts             polite HTTP client
src/editions.ts         table: source edition code → set, release, language, group
src/rarities.ts         table of rarities
src/normalize.ts        neutral format → catalog model, English / French matching, checks, stable sort
src/images.ts           local image store, thumbnails (sharp), attaching images to printings
src/crawl.ts            the crawl command
src/build.ts            the build command: catalog.json, manifest.json, report.json
src/publish.ts          the publish command (Cloudflare Pages, CORS headers)
src/model.ts            types of the output catalog
test/fixtures/          real API responses, truncated
```

## Publishing

`pnpm publish-catalog` stages the JSON files and the referenced images, writes the `_headers` file (CORS open, since the app runs on another origin) and runs a pinned version of `wrangler pages deploy`. Set `CATALOG_PROJECT` to target a project other than `nova-preem-catalog`. Setup: [`docs/deploy.md`](../docs/deploy.md).

## Legal

Card names, texts and images belong to WeirdCo and CD PROJEKT RED. The generated files are not covered by the project's MIT license.
