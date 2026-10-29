# Nova Preem — app (PWA)

Application de collection, hors-ligne d'abord. Spécification : [`docs/app-spec.md`](../docs/app-spec.md) ; maquettes : [`docs/mockups/`](../docs/mockups/).

## Commandes

```bash
pnpm install
pnpm dev        # serveur de développement, http://localhost:5173 (sans service worker)
pnpm build      # vérification des types (app, domaine, tests) puis build de production dans dist/
pnpm preview    # sert le build de production, http://localhost:4173 (avec service worker)
pnpm test       # tests Vitest (domaine, stockage IndexedDB simulé, rendu des écrans)
pnpm icons      # régénère les icônes de public/ (sharp)
```

Le catalogue n'est pas copié dans l'app : en développement et en preview, `/catalog/` est servi depuis `../catalog/dist/` (voir `build/serve-catalog.ts`). En production, la CI fixe `VITE_CATALOG_BASE_URL` sur le site du catalogue (voir [`docs/deploy.md`](../docs/deploy.md)).

## Organisation

```
src/domain/     règles, types et schémas (Zod) ; pur : ni React, ni Dexie, ni API du navigateur
src/storage/    implémentations IndexedDB (Dexie) des interfaces CatalogStore, CollectionStore, SettingsStore
src/platform/   navigateur : téléchargement HTTP, hachage, réseau, service worker, assemblage des services
src/i18n/       textes de l'interface (FR, EN)
src/ui/         React : mise en page, écrans, styles (variables CSS dans ui/styles/tokens.css)
```

La pureté du domaine est vérifiée deux fois : `tsconfig.domain.json` compile `src/domain/` sans les types du navigateur, et `test/domain/purity.test.ts` contrôle ses imports.

## Tester sur Android (USB)

1. Sur le téléphone : activer les options pour les développeurs et le **débogage USB**, brancher le câble, accepter l'empreinte du PC.
2. Sous Windows, dans Chrome : `chrome://inspect/#devices`, cocher **Discover USB devices** ; le téléphone apparaît.
3. **Port forwarding** : `4173` → `localhost:4173` (et `5173` → `localhost:5173` pour le dev). WSL 2 relaie `localhost` vers Windows.
4. Dans WSL : `pnpm build && pnpm preview`.
5. Sur le téléphone, dans Chrome : `http://localhost:4173`. Comme l'adresse est `localhost`, Chrome la traite comme sécurisée : le service worker et l'installation fonctionnent sans HTTPS.
6. Menu ⋮ → **Installer l'application** (ou « Ajouter à l'écran d'accueil »).
