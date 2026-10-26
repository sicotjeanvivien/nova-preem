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
catalog/   pipeline de génération du catalogue (Node + TypeScript)  ← EN COURS
app/       PWA (Vite + React + TypeScript, Dexie pour IndexedDB)    ← ensuite
docs/      spécifications
```

Documents de référence :
- `docs/catalog-spec.md` : le pipeline du catalogue (source, normalisation, format de sortie).
- `docs/app-spec.md` : l'app MVP (écrans, fichier de collection, règles de complétion, doublons, recherche, étapes). **Lire avant toute modification de `app/`**, et suivre ses étapes dans l'ordre.

## Travail en cours : le pipeline du catalogue

**Lire `docs/catalog-spec.md` avant toute modification de `catalog/`.** Il contient la source de données (API Netdeck), le format réel des données, les règles de normalisation (décomposition édition → set / tirage / langue, rattachement VO ↔ VF) et le format de sortie.

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
