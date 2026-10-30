# Nova Preem

A collection manager for the **Cyberpunk Trading Card Game**: record the cards you own, printing by printing, and see what you are missing. It works offline and installs on your phone as an app.

**Use it:** https://nova-preem.pages.dev (Android, iPhone, PC; French and English)

> Fan-made and unofficial. Nova Preem is not approved or endorsed by WeirdCo or CD PROJEKT RED.

## Why another app?

Player tools already exist for the Cyberpunk TCG (deck builders, metagame, online play). Nova Preem is for **collectors**, in the spirit of UrzaGatherer for Magic: The Gathering:

- **Every printing counts.** The same card exists in Retail, Beta, starter decks, demo decks, promos, Iconic arts, in English and in French. Nova Preem tracks each one separately.
- **Fast entry.** Open a booster, tap + on each card. Undo is one tap away.
- **Completion your way.** Per set, per release, per language: playable set, master set, missing cards (copied as a list ready to paste on Discord), duplicates above the number you keep.
- **Your collection as a gallery**, with filters and sorting, and a 3D view of each card.
- **Offline first.** Once the catalog is downloaded, everything works without a network, card images included if you want.
- **Your data stays yours.** No account and no server: the collection lives on your device. You can export it to a file, or sync it to **your own Google Drive** (optional).

## How it works

Two kinds of data, kept strictly apart:

| | Catalog (the cards) | Collection (what you own) |
|---|---|---|
| Made by | the pipeline in [`catalog/`](catalog/) | you, in the app |
| Content | sets, releases, cards, printings, translations, images | quantities per printing, settings |
| Stored | static JSON and images on a CDN | in your browser (IndexedDB), and optionally a file in your Google Drive |

The collection only holds stable printing IDs and quantities, so a catalog update never touches it. There is no backend: the project hosts no user data.

## Repository

```
app/       the app: a PWA built with Vite, React, TypeScript and Dexie      → app/README.md
catalog/   the pipeline that builds the card catalog (Node, TypeScript)    → catalog/README.md
docs/      specifications (in French) and the design mockups
```

Specifications:

- [`docs/app-spec.md`](docs/app-spec.md): screens, collection file, completion rules, duplicates, search.
- [`docs/catalog-spec.md`](docs/catalog-spec.md): data source, normalization, catalog format.
- [`docs/sync-spec.md`](docs/sync-spec.md): Google Drive sync (three-way merge, sign-in without a backend).
- [`docs/deploy.md`](docs/deploy.md): hosting on Cloudflare Pages and CI.

## Quick start

Requirements: Node 22 or later and [pnpm](https://pnpm.io/).

```bash
git clone https://github.com/sicotjeanvivien/nova-preem.git
cd nova-preem/app
pnpm install
pnpm dev        # http://localhost:5173
```

The app reads the catalog committed in `catalog/dist/`. Card images are not in the repository: the cards show a neutral placeholder until you run the catalog pipeline (see [`catalog/README.md`](catalog/README.md)).

## Roadmap

- [x] MVP: sets, quick entry, card page, collection, search, stats, export and import
- [x] Google Drive sync
- [x] 3D card view
- [ ] Android app on the Play Store (Trusted Web Activity)

Not planned: deck builder, prices, card scanning, user accounts.

## License

The **source code** is released under the [MIT License](LICENSE), © AWSD. The Nova Preem name and logo belong to AWSD.

The **card data and images** are not covered by this license. Card names, texts, artwork and the Cyberpunk name belong to WeirdCo and CD PROJEKT RED. The files in `catalog/dist/` are generated from public card data for the app to work, and remain their property.
