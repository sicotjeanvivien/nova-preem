# Mise en ligne et CI

Deux sites statiques sur **Cloudflare Pages**, sur deux origines :

| | App (PWA) | Catalogue |
|---|---|---|
| Projet Pages | `nova-preem` | `nova-preem-catalog` |
| Contenu | `app/dist/` | `catalog.json`, `manifest.json`, `images/` (miniatures comprises) |
| Déployé par | la CI, à chaque push sur `main` dont les vérifications passent | à la main, `pnpm publish-catalog` dans `catalog/` |
| En-têtes | `app/public/_headers` | écrits par `catalog/src/publish.ts` (CORS ouvert : l'app est sur une autre origine) |

Le catalogue n'est pas publié par la CI : ses images n'existent que là où le crawl a tourné (`catalog/dist/images/` est ignoré par git), et la source ne doit pas être crawlée à chaque push.

L'app trouve le catalogue grâce à `VITE_CATALOG_BASE_URL`, fixée au build par la variable GitHub `CATALOG_BASE_URL`. Pages sert `index.html` pour toute route inconnue (pas de `404.html` à la racine), ce dont les routes de l'app ont besoin.

## CI (`.github/workflows/ci.yml`)

- **catalog** : typecheck et tests du pipeline.
- **app** : tests, puis `pnpm build` (qui vérifie aussi les types de l'app, du domaine et des tests).
- **deploy** (push sur `main` seulement, après les deux autres) : build avec l'URL du catalogue, puis `wrangler pages deploy`.

## Mise en place (une seule fois)

1. Créer un compte Cloudflare (gratuit), puis, dans WSL :
   ```bash
   cd catalog
   pnpm dlx wrangler@4.155.0 login        # ouvre une page d'autorisation dans le navigateur
   pnpm dlx wrangler@4.155.0 pages project create nova-preem --production-branch=main
   pnpm dlx wrangler@4.155.0 pages project create nova-preem-catalog --production-branch=main
   ```
   Chaque commande `create` affiche l'adresse du site (`https://<projet>.pages.dev`). Si le nom est déjà pris ailleurs, Cloudflare ajoute un suffixe : noter l'adresse réelle.
2. Publier le catalogue : `pnpm publish-catalog`.
3. Dans Cloudflare : **My Profile → API Tokens → Create Token**, modèle « Edit Cloudflare Workers » ou jeton personnalisé avec la seule permission **Account → Cloudflare Pages → Edit**. Relever aussi l'**Account ID** (page d'accueil du compte, ou `wrangler whoami`).
4. Dans GitHub, **Settings → Secrets and variables → Actions** :
   - secrets : `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` ;
   - variable : `CATALOG_BASE_URL` = adresse du site du catalogue, **avec la barre finale** (`https://nova-preem-catalog.pages.dev/`) ;
   - variable facultative : `APP_PROJECT`, si le projet de l'app ne s'appelle pas `nova-preem`.
5. Relancer le dernier workflow de `main` (ou pousser sur `main`) : l'app est déployée.

## Au quotidien

- **App** : merger sur `main` suffit.
- **Catalogue** : `pnpm crawl && pnpm build && pnpm publish-catalog` dans `catalog/`. L'app détecte la nouvelle version par `manifest.json` et propose la mise à jour. `CATALOG_PROJECT=<nom>` change le projet visé.

## Points d'attention

- **Changer l'adresse de l'app** (domaine personnel plus tard) : une PWA installée reste attachée à son origine, et les collections locales (IndexedDB) aussi. Il faudra un export / import pour migrer.
- Les images de cartes gardent leur chemin quand l'illustration change à la source : elles sont mises en cache un jour par le navigateur, sans limite par le service worker une fois vues.
