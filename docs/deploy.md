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
   - variable `GOOGLE_CLIENT_ID` : identifiant client OAuth de la synchronisation Google Drive (ci-dessous). Sans elle, la synchronisation reste désactivée (ligne « Bientôt » dans Réglages).
5. Relancer le dernier workflow de `main` (ou pousser sur `main`) : l'app est déployée.

## Synchronisation Google Drive (une seule fois)

Détail : `docs/sync-spec.md` §4 et §9. L'app n'utilise qu'un **identifiant client** OAuth, public ; aucun secret.

1. Sur https://console.cloud.google.com, créer un projet `Nova Preem` et y activer l'**API Google Drive** (APIs et services → Bibliothèque).
2. **Google Auth Platform** (ou « Écran de consentement OAuth ») :
   - *Branding* : nom `Nova Preem`, adresse d'assistance et de contact ;
   - *Audience* : type **Externe**, mode **Test**, et chaque compte qui doit pouvoir se connecter dans les **utilisateurs test** (100 au plus) ;
   - *Accès aux données* : `.../auth/drive.file`, `openid`, `.../auth/userinfo.email` (aucune n'est « sensible »).
3. *Clients* → créer un client OAuth de type **Application Web**, origines JavaScript autorisées : `https://nova-preem.pages.dev`, `http://localhost:5173`, `http://localhost:4173`. Pas d'URI de redirection.
4. Copier l'**ID client** :
   - en développement, dans `app/.env.local` : `VITE_GOOGLE_CLIENT_ID=<ID client>` (fichier ignoré par git) ;
   - pour la mise en ligne : `gh variable set GOOGLE_CLIENT_ID --body "<ID client>"`.

En mode Test, Google affiche « Google n'a pas validé cette application » à la connexion : c'est attendu. Le passage en production demandera un domaine vérifié et une politique de confidentialité (`docs/sync-spec.md` §9).

## Au quotidien

- **App** : merger sur `main` suffit.
- **Catalogue** : `pnpm crawl && pnpm build && pnpm publish-catalog` dans `catalog/`. L'app détecte la nouvelle version par `manifest.json` et propose la mise à jour. `CATALOG_PROJECT=<nom>` change le projet visé.

## Pages légales

Les textes de `docs/legal/` sont convertis en HTML au build (`app/build/legal.ts`, voir `docs/legal-spec.md`). Deux variables, avec leur valeur par défaut dans `app/.env` :

- `VITE_SITE_DOMAIN` : le domaine public, sans `https://` (`nova-preem.pages.dev` tant qu'il n'y a pas de domaine propre) ;
- `VITE_CONTACT_EMAIL` : l'adresse de contact (`awsd.contact@gmail.com`).

Pour les changer en production, modifier `app/.env` (ou les définir comme variables d'environnement du build). Le build échoue si l'une est vide ou si un texte contient un autre marqueur `{{…}}`. Le build écrit aussi `dist/a-propos.html`, `confidentialite.html`, `mentions-legales.html` et `cgu.html`, lisibles sans JavaScript : `curl https://nova-preem.pages.dev/confidentialite` doit renvoyer le texte complet.

## Points d'attention

- **Changer l'adresse de l'app** (domaine personnel plus tard) : une PWA installée reste attachée à son origine, et les collections locales (IndexedDB) aussi. Il faudra un export / import pour migrer.
- Les images de cartes gardent leur chemin quand l'illustration change à la source : elles sont mises en cache un jour par le navigateur, sans limite par le service worker une fois vues.
