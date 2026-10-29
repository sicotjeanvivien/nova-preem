# Nova Preem

Application web/mobile (PWA) pour gérer sa **collection** de cartes du **Cyberpunk TCG** (WeirdCo / CD Projekt Red), sur le modèle d'**UrzaGatherer** pour Magic: The Gathering.

Projet personnel destiné à devenir public. Fan-made, non officiel.

## Positionnement

- **Collectionneurs d'abord.** Pas de deck builder, pas de méta, pas de jeu en ligne : les outils joueurs existent déjà (ripperdeck, CHOOM.GG, ExBurst…). Le deck builder viendra plus tard, si besoin.
- **Gestion fine des impressions** : une même carte existe en Beta, Retail, VF, promos, Iconic… C'est le cœur de la différenciation.
- **Multilingue** : VO (EN) et VF (FR) d'abord, architecture prévue pour d'autres langues.
- **Hors-ligne d'abord** : l'app doit fonctionner sans réseau une fois le catalogue téléchargé.

## Architecture (principe UrzaGatherer)

Deux types de données strictement séparés :

| | Catalogue (les cartes) | Collection (ce que l'utilisateur possède) |
|---|---|---|
| Produit par | le pipeline `catalog/` de ce dépôt | l'utilisateur, dans l'app |
| Contenu | sets, tirages, cartes, impressions, traductions, images | quantités par impression, réglages |
| Stockage | fichier JSON statique versionné, servi par un CDN | local (IndexedDB), puis fichier dans le cloud **de l'utilisateur** |
| Mise à jour | à chaque nouvelle donnée source | à chaque saisie |

Conséquences :
- **Pas de backend ni de base serveur.** Les données utilisateur ne sont jamais hébergées par le projet (pas de RGPD, pas de coût).
- La collection référence uniquement des **identifiants d'impression stables** (UUID de la source) + des quantités.
- Synchronisation cloud **après le MVP** : Google Drive en premier, via une couche « fournisseur de stockage » abstraite. Le format du fichier de collection (export/import du MVP) est le futur fichier de synchro.

## Structure du dépôt

```
catalog/   pipeline de génération du catalogue (Node + TypeScript)  ← terminé (MVP)
app/       PWA (Vite + React + TypeScript, Dexie pour IndexedDB)    ← EN COURS
docs/      spécifications ; docs/mockups/ = copie du canevas de maquettes
```

Documents de référence :
- `docs/catalog-spec.md` : le pipeline du catalogue (source, normalisation, format de sortie).
- `docs/deploy.md` : mise en ligne (Cloudflare Pages) et CI.
- `docs/app-spec.md` : l'app MVP (écrans, fichier de collection, règles de complétion, doublons, recherche, étapes). **Lire avant toute modification de `app/`**, et suivre ses étapes dans l'ordre.

Règles de portabilité de l'app (détail : `docs/app-spec.md` §9.1) : `app/src/domain/` n'importe ni React, ni Dexie, ni API du navigateur ; tout stockage passe par une interface (`CollectionStore`…) dont Dexie n'est qu'une implémentation. Distribution : PWA, puis TWA pour le Play Store, Capacitor seulement si besoin natif.

## Travail en cours : l'app

**Lire `docs/app-spec.md` avant toute modification de `app/`**, et réaliser ses étapes (§10) **dans l'ordre**, une à la fois : ne pas commencer une étape tant que le critère de la précédente n'est pas rempli.

Règles importantes :
- **Maquettes de référence** : le canevas Design « Nova Preem — MVP » (https://claude.ai/artifact/EeVh5fSkMmUbTXN9fnKwXC), copié dans `docs/mockups/` (le canevas fait foi en cas de différence). Les `.dc.html` sont des maquettes, pas du code à copier : reconstruire l'interface en React, avec des variables CSS.
- En cas de conflit, `docs/app-spec.md` fait foi pour les règles et le comportement, le canevas pour l'apparence. **Signaler tout conflit** au lieu de trancher en silence.
- Mobile et bureau : mêmes écrans, mêmes fonctions, mêmes filtres ; seule la disposition change. Une fonction absente d'une des deux maquettes est un oubli : l'appliquer aux deux.
- Les données viennent du vrai catalogue (`catalog/dist/`), jamais des maquettes (échantillon de 60 cartes, quantités fictives).
- Portabilité (§9.1) : `app/src/domain/` est pur ; le stockage passe par les interfaces `CatalogStore`, `CollectionStore`, `SettingsStore`.

## Le catalogue (terminé pour le MVP)

**Lire `docs/catalog-spec.md` avant toute modification de `catalog/`.** Il contient la source de données (API Netdeck), le format réel des données, les règles de normalisation (décomposition édition → set / tirage / langue, rattachement VO ↔ VF), le format de sortie et les constats sur les données réelles (§9). Mise à jour : `pnpm crawl && pnpm build` dans `catalog/`.

Règles importantes :
- La source est une API **non documentée et non officielle**. Être poli : requêtes espacées, cache, User-Agent identifiable (voir la spec). Ne jamais la marteler.
- Tout ce qui touche à la source passe par un **adaptateur** : quand l'API officielle de Netdeck sortira, seul l'adaptateur changera.
- Ne jamais rattacher deux impressions « au hasard » : une impression sans correspondance doit être **signalée** dans le rapport, pas devinée.
- Vérifier les hypothèses de la spec sur les données réelles et signaler tout écart plutôt que de forcer le modèle.

## Stack et conventions

- Node 22+, TypeScript strict, ESM, gestionnaire de paquets **pnpm**.
- Code, identifiants et commits en **anglais**. Documentation et textes d'interface en **français** (l'interface sera aussi traduite en anglais).
- Validation des données entrantes avec un schéma (Zod) : si la source change de format, le pipeline doit échouer clairement, pas produire un catalogue corrompu.
- Tests avec Vitest, notamment sur la normalisation (fixtures tirées de vraies réponses de l'API).
- Pas de dépendance lourde sans raison. Pas de Rails, pas de jQuery.
- L'environnement de développement est **WSL (Ubuntu)** sous Windows.

## Hors périmètre (ne pas implémenter sans demande)

Deck builder, prix et valeur de collection, scan de carte, comptes utilisateurs, backend, marketplace, multi-TCG.

## Propriété intellectuelle

Les noms, textes et images des cartes appartiennent à WeirdCo / CD Projekt Red. Ne jamais utiliser « Cyberpunk », « Night City », « Netrunner » ou d'autres marques dans le nom ou l'identité de l'app. Afficher une mention « fan-made, non officiel » dans l'app.
