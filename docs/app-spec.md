# Spécification de l'app MVP

Ce document décrit l'application (PWA) : écrans, données de la collection, règles de calcul et découpage en étapes. Il complète `docs/catalog-spec.md`, qui décrit le catalogue que l'app consomme.

**Maquettes de référence :** canevas « Nova Preem — MVP » (https://claude.ai/artifact/EeVh5fSkMmUbTXN9fnKwXC, privé : le propriétaire du dépôt y a accès). Les maquettes donnent la disposition, les libellés et le comportement attendu ; en cas d'écart, **ce document fait foi** pour les règles, les maquettes pour l'apparence.

---

## 1. Objectif du MVP

Un collectionneur ouvre ses boosters et enregistre ses cartes en quelques secondes, voit ce qu'il possède et ce qui lui manque, par set, par tirage et par langue, sans connexion réseau. Ses données restent sur son appareil et peuvent être exportées.

Le MVP est **fini** quand :
- le catalogue complet (toutes les cartes et impressions VO/VF) est consultable hors-ligne ;
- on peut saisir les cartes d'un booster d'un tap par carte, et annuler ;
- les cinq onglets fonctionnent sur les données réelles ;
- l'export puis l'import d'une collection restituent exactement la même collection ;
- l'app est installable sur Android (PWA) et utilisable sur PC dans un navigateur.

---

## 2. Navigation

Cinq onglets, dans cet ordre : **Sets · Collection · Recherche · Stats · Réglages**. L'app s'ouvre sur **Sets**.

| Onglet | Rôle | Maquettes (mobile / web) |
|---|---|---|
| Sets | Tout le catalogue, en quatre niveaux (ci-dessous) ; c'est là qu'on saisit | `Main`, `SetReleases`, `SetGrid`, `CardDetail` / `WebSetList`, `WebSetReleases`, `WebSets`, `WebCard` |
| Collection | Uniquement ce qui est possédé, avec filtres et tri | `Collection` / `WebCollection` |
| Recherche | Recherche dans tous les sets et toutes les langues | `Search` / `WebSearch` |
| Stats | Complétion et chiffres de la collection | `Completion` / `WebStats` |
| Réglages | Saisie, complétion, affichage, données | `Settings` / `WebSettings` |

### 2.1 Sets : quatre niveaux (modèle UrzaGatherer : Blocs → extensions → cartes)

1. **Liste des sets** (`/sets`) : une tuile par set (icône, nom, **tirages complétés / tirages** — ex. « 2 / 17 tirages complétés » —, barre de progression de la même proportion), avec un champ de filtre par nom. Un set annoncé mais absent du catalogue n'apparaît pas (la maquette montre *Edgerunners: Burn Bright* « à venir » à titre d'illustration).
2. **Tirages du set** (`/sets/:setId`) : **une tuile par tirage** (Retail, Beta, chaque starter, chaque deck démo, chaque série de promos), regroupées sous les titres « Set principal », « Starters », « Decks démo », « Promos » (groupes `main`, `starter`, `demo`, `promo`), dans l'ordre `release.order`. Chaque tuile : bandeau avec le nom du tirage et un ruban vertical indiquant le groupe, variantes possédées / total, pourcentage, barre de progression, langues disponibles (VO, VF). Champ de filtre par nom. Un tirage sans impression n'est pas affiché.
3. **Cartes d'un tirage** (`/sets/:setId/:releaseId`) : la grille des cartes du tirage, dans l'ordre des numéros. C'est l'écran de **saisie** (§5.1) : chaque vignette a ses boutons **− quantité +** ; un clic sur l'image ou le nom ouvre la page carte. Filtres : toutes, manquantes, possédées, doublons ; « Copier la liste » avec le filtre Manquantes.
4. **Page carte** (`/cartes/:slug`) : **une seule page**, ouverte depuis les cartes d'un tirage, la Collection ou la Recherche (§5.9).

Le fil d'Ariane (bureau) et le bouton retour (mobile) remontent d'un niveau : page carte → cartes du tirage → tirages du set → liste des sets.

Écrans hors barre : **états** (`States` / `WebStates`) : premier lancement, hors-ligne, nouveau catalogue, collection vide.

**Règle d'harmonisation** : mobile et bureau ont **les mêmes écrans, les mêmes fonctions et les mêmes filtres**. Seule la disposition change (§8). Une fonction présente sur une seule des deux maquettes est un oubli de maquette, pas une différence voulue.

Il n'y a **pas d'onglet « Manques »** : les manques sont le filtre « Manquantes » de la page des cartes d'un tirage, les doublons le filtre « Doublons » de Collection.

Chaque écran a une URL (routage côté client) pour que le bouton retour d'Android et l'historique du navigateur fonctionnent. Le tirage est dans le chemin et les filtres de la page des cartes sont dans l'URL (`/sets/wnc/wnc-retail?filtre=manquantes&langue=fr`), pour que le retour depuis une page carte retrouve exactement le même état.

---

## 3. Vocabulaire

Repris de `catalog-spec.md` :
- **Set** : ensemble logique (ex. *Welcome to Night City*).
- **Tirage (release)** : Retail, Beta, starters, démos, promos ; appartient à un set et à un **groupe** (`main`, `starter`, `demo`, `promo`).
- **Carte** : la carte abstraite (`card.id`).
- **Impression (printing)** : une carte dans un tirage, à un numéro, **dans une langue** (`printing.id`).
- **Variante** : l'ensemble des impressions d'une carte dans un même tirage au même numéro, toutes langues confondues (`variantKey`, ex. `wnc-retail#003`).

---

## 4. Données de la collection

### 4.1 Ce qui est stocké

La collection ne contient **que des identifiants d'impression et des quantités**, plus des dates. Elle ne copie jamais de données du catalogue.

```ts
interface CollectionEntry {
  printingId: string;     // printing.id du catalogue (UUID de la source)
  quantity: number;       // entier ≥ 1 ; une entrée à 0 est supprimée
  firstAddedAt: string;   // ISO 8601, première saisie
  lastAddedAt: string;    // ISO 8601, dernière saisie qui a augmenté la quantité (tri « Récents »)
}
```

### 4.2 Stockage local

IndexedDB via **Dexie**, une base `nova-preem` :

| Table | Clé | Contenu |
|---|---|---|
| `entries` | `printingId` | `CollectionEntry` |
| `settings` | `key` | réglages (§7) |
| `catalog` | `key` | le catalogue (`catalog.json`) et son manifeste |

Chaque saisie est écrite immédiatement (pas de bouton « enregistrer »).

### 4.3 Fichier d'export (futur fichier de synchro)

Nom par défaut : `nova-preem-collection-AAAA-MM-JJ.json`.

```json
{
  "format": "nova-preem/collection",
  "schemaVersion": 1,
  "exportedAt": "2026-11-06T18:42:00Z",
  "app": { "version": "0.1.0" },
  "catalog": { "version": "2026-10-26.1" },
  "entries": [
    { "printingId": "7f03795b-029a-4347-a685-d67dcd879a93", "quantity": 1, "firstAddedAt": "…", "lastAddedAt": "…" }
  ],
  "settings": { "entryReleaseId": "wnc-retail", "entryLanguage": "fr", "duplicateThreshold": 1, "completionGroups": ["main", "starter"], "cardNameLanguage": "entry" }
}
```

Règles :
- `entries` triées par `printingId` pour un fichier stable (diff lisible, synchro future plus simple).
- **Import** : l'utilisateur choisit **Remplacer** (la collection devient celle du fichier) ou **Fusionner** (pour chaque impression, on garde la **plus grande** quantité et les dates extrêmes). Avant d'appliquer, afficher un résumé : impressions ajoutées, modifiées, inconnues.
- Un `printingId` absent du catalogue courant n'est **pas supprimé** : il est conservé et signalé (« N impressions inconnues du catalogue actuel »). Il sera retrouvé à la prochaine mise à jour du catalogue.
- Un fichier dont `format` ou `schemaVersion` est inconnu est refusé avec un message clair.
- Le fichier est validé avec Zod avant toute écriture.

### 4.4 Export CSV

Une ligne par entrée, séparateur `;` (Excel FR), UTF-8 avec BOM : `set;tirage;numero;langue;nom;rarete;quantite;ajoute_le`. Lecture seule, pas d'import CSV dans le MVP.

---

## 5. Règles métier

### 5.1 Saisie

- La saisie se fait sur la page des **cartes d'un tirage** : le tirage est celui de la page.
- Chaque vignette affiche **− quantité +**. **+** ajoute 1 exemplaire de l'impression (tirage, numéro, langue choisie), **−** en retire 1 (jamais en dessous de 0 ; le bouton − est grisé à 0). La page ne change pas.
- La **langue** des quantités se choisit avec le sélecteur VF/VO de la page ; défaut : la langue de saisie des Réglages (VF). Le sélecteur n'apparaît que si le tirage existe dans plusieurs langues (aujourd'hui, seul le Retail a une VF). Quand une autre langue est aussi possédée, un petit badge sur l'image l'indique (ex. « VO 1 »).
- **Un clic sur l'image ou le nom** de la carte ouvre la **page carte** (§5.9). Il n'y a plus de « tap pour ajouter » ni de mode retrait.
- Après chaque + ou −, un bandeau « +1 [nom] · VF » avec **Annuler** (annule exactement la dernière action). Le bandeau reste jusqu'à l'action suivante ou 5 s.
- Sur la page carte, chaque impression (tous tirages, toutes langues) a aussi ses boutons − et +.

### 5.2 Possession

- Une **impression** est possédée si sa quantité ≥ 1.
- Une **variante** est possédée « toutes langues » si au moins une de ses impressions est possédée, possédée « en VF » si son impression FR est possédée, etc.
- Une **carte** est possédée si au moins une de ses impressions est possédée (tous tirages confondus).

### 5.3 Complétion

Les **groupes comptés** sont réglables (défaut : `main` + `starter`). Ils s'appliquent aux calculs « set jouable » et « master set » (onglet Stats) ; le calcul « par tirage » porte toujours sur le tirage choisi, et « tirages complétés » sur tous les tirages du set.

Chaque niveau de Sets résume celui d'en dessous : la liste des sets compte des **tirages** (pas des cartes), la page des tirages compte des **variantes**. Le nombre de cartes du set (151 pour Welcome to Night City, comme sur le site officiel) n'est pas une mesure de complétion de la liste des sets.

| Mesure | Dénominateur | Numérateur |
|---|---|---|
| **Set jouable** | cartes du set ayant au moins une impression dans un tirage d'un groupe compté | celles possédées dans **n'importe quelle** de ces impressions |
| **Master set** | impressions du set dans les groupes comptés (chaque langue compte) | impressions possédées |
| **Par tirage, toutes langues** | variantes du tirage | variantes possédées toutes langues |
| **Par tirage, en VF / en VO** | impressions du tirage dans cette langue | impressions possédées dans cette langue |
| **Tirages complétés** (tuile d'un set, liste des sets) | tirages du set ayant au moins une impression (tous groupes : ce sont les tuiles du niveau 2) | tirages dont la mesure « par tirage, toutes langues » est à 100 % |

Conséquences :
- Une impression **exclusive à un tirage** (ex. Iconic `β168`, Beta uniquement) n'entre que dans le dénominateur de ce tirage : elle n'est jamais « manquante » ailleurs.
- Si une langue n'existe pas pour un tirage (ex. Beta en VF), le calcul « en VF » de ce tirage n'est pas proposé.
- Les pourcentages sont arrondis à l'entier **inférieur**, pour que 100 % signifie toujours « tout possédé » (99,6 % s'affiche 99 %).
- Ventilations affichées dans Stats : par type de carte (set jouable), par tirage et langue (master set), par rareté (par tirage).

### 5.4 Manques

- Filtre « Manquantes » de la page des cartes d'un tirage : variantes non possédées selon la langue sélectionnée dans la portée (toutes langues, VF, VO).
- Une carte manquante en VF mais possédée en VO porte l'indication « en VO ».
- **Copier la liste** copie un texte prêt à coller sur Discord :

```
Manques — Welcome to Night City · Retail · VF (12)
#015 Octant (C)
#035 Souvenirs en Lambeaux (R)
…
```

### 5.5 Doublons

- Réglage : **seuil** = nombre d'exemplaires gardés par impression (défaut 1, de 1 à 9).
- Une impression est en doublon si `quantité > seuil` ; le **surplus** = `quantité − seuil`.
- Le seuil s'applique **par impression** (une VF et une VO de la même carte sont comptées séparément).
- Filtre « Doublons » de Collection : seules les impressions en doublon, surplus affiché.

### 5.6 Recherche

- Porte sur **toutes les cartes du catalogue**, possédées ou non, tous sets et tous tirages.
- Le texte cherché est comparé, **sans casse ni accents** (normalisation NFD), à : les noms de la carte dans toutes les langues, ses numéros de collection, et ses classifications. Option dans les filtres : inclure le texte de règles.
- Un résultat par **carte** (pas par impression) : nom dans la langue d'affichage, nom dans l'autre langue en dessous (préfixé « VO : » quand c'est lui qui correspond), type, liste résumée des impressions, badge « Possédée ×N » ou « Manquante ».
- Filtres : type, couleur, rareté, set, coût, RAM, possession (toutes / possédées / manquantes), et une case « Chercher aussi dans le texte de règles ». Les valeurs proposées viennent du catalogue. Mêmes filtres sur mobile et sur bureau.
- La recherche s'exécute à chaque frappe, sans réseau.

### 5.7 Collection (onglet)

But : **admirer sa collection**. C'est une **galerie**, pas une liste ni un tableau.

- Une **image de carte en grand format** (proportions de la carte) par **impression possédée**. Sur l'image : badge de rareté, badges de quantité par langue (« VF ×2 », « VO ×1 »), et le surplus avec le filtre Doublons (« +2 en trop »). Sous l'image : nom, tirage et numéro.
- **Un clic sur une carte ouvre sa page carte** (§5.9) ; le retour ramène à la galerie dans le même état. Pas de + ni de − dans la galerie : la saisie se fait dans Sets ou sur la page carte.
- Filtres : langue (toutes / VF / VO), doublons, set, tirage, rareté, type, couleur. Sur bureau, ils sont dans une **colonne à gauche**, toujours visible ; sur mobile, dans un **panneau** ouvert par le bouton « Filtres » (qui affiche le nombre de filtres actifs), avec « Réinitialiser » et « Voir N cartes ».
- Champ de filtre par nom (VF et VO, sans accents).
- Tri : **Ajouts récents** (`lastAddedAt` décroissant, défaut), numéro, nom (ordre alphabétique français), rareté (de la plus rare à la plus commune), quantité.
- **Taille des cartes** réglable sur bureau (curseur en bas de la galerie) ; mobile : deux colonnes. Le réglage est mémorisé.
- Résumé en haut : nombre d'exemplaires et nombre d'impressions affichées.
- Les images viennent du cache (§6) ; une image absente hors-ligne affiche l'emplacement neutre avec le nom et le numéro.

### 5.8 Langue des noms

Réglage : « Langue de saisie » (défaut : les noms suivent le sélecteur VF/VO), « Toujours VF », « Toujours VO ». Si un nom n'existe pas dans la langue demandée, afficher le nom anglais.

### 5.9 Page carte

Une seule page par carte (`/cartes/:slug`), la même quel que soit l'écran d'où l'on vient.

- **Contenu** : image de l'impression sélectionnée (par défaut, celle du tirage et de la langue d'où l'on vient, sinon la première impression Retail dans la langue d'affichage), vignettes des autres impressions pour changer d'image, nom dans la langue d'affichage et dans l'autre langue, type, couleur, RAM / coût / power quand ils existent, classifications, texte de règles avec sélecteur VF/VO.
- **Impressions** : toutes les impressions de la carte, groupées par tirage puis par numéro, une ligne par langue, avec rareté, quantité, − et +. Une impression exclusive à un tirage porte une mention (ex. « exclusive Beta »). Les artistes sont indiqués.
- **Retour contextuel** : le bouton retour ramène à l'écran d'origine, dans le même état (filtres, langue, position de défilement) ; son libellé nomme cet écran (« Welcome to Night City · Retail », « Collection », « Recherche »). Arrivé par un lien direct, il ramène aux cartes du tirage de l'impression affichée.
- **Précédente / suivante** : uniquement en venant de la page des cartes d'un tirage, pour parcourir les cartes **dans l'ordre et avec les filtres de cette page** (ex. seulement les manquantes du Retail). Libellés avec numéro et nom de la carte voisine.
- Textes divergents entre impressions d'une même langue (cas réels, voir `catalog-spec.md` §9) : afficher le texte de l'impression sélectionnée, c'est-à-dire `printing.printedRulesText` s'il existe, sinon `card.rulesText[langue]`.

---

## 6. Catalogue dans l'app

- Au premier lancement : téléchargement de `manifest.json` puis `catalog.json`, avec une barre de progression (maquette États 1). Tant que ce n'est pas fait, l'app n'affiche rien d'autre.
- À chaque lancement, en ligne : comparaison du `hash` du manifeste distant avec celui stocké. S'il diffère, proposer la mise à jour (maquette États 3) ; la collection n'est jamais modifiée par une mise à jour.
- **Images** : mises en cache par le service worker au fil de la navigation (stratégie cache-first). Réglage « Télécharger toutes les images » (Wi-Fi recommandé). Une image absente hors-ligne affiche un emplacement neutre avec le nom et le numéro.
- Hors-ligne : bandeau discret (maquette États 2), toutes les fonctions restent disponibles sauf la mise à jour du catalogue.
- En développement, le catalogue est servi depuis `catalog/dist/` ; l'URL de base est configurable (variable d'environnement). En production, il est sur son propre site, sur une autre origine que l'app (voir `docs/deploy.md`) : les images de cartes sont donc chargées en CORS (`crossorigin="anonymous"`), comme le téléchargement complet.

---

## 7. Réglages

| Réglage | Valeurs | Défaut |
|---|---|---|
| Tirage de saisie par défaut | tirages du catalogue | `wnc-retail` |
| Langue de saisie par défaut | langues du catalogue | `fr` |
| Groupes comptés dans la complétion | `main`, `starter`, `demo`, `promo` | `main`, `starter` |
| Seuil de doublon | 1 à 9 | 1 |
| Langue des noms de cartes | langue de saisie / VF / VO | langue de saisie |
| Langue de l'interface | FR / EN | langue du navigateur, FR sinon |
| Télécharger toutes les images | oui / non | non |

Section Données : version du catalogue et bouton « Vérifier », **Exporter**, **Importer**, **CSV**, et la ligne « Synchronisation Google Drive — Bientôt » (désactivée).

Mention en bas de Réglages et dans « À propos » : outil de fan, non officiel ; noms, textes et images appartiennent à leurs ayants droit.

---

## 8. Interface

- Mobile d'abord, largeur de référence 390 px. **Une seule app** : la mise en page s'adapte à la largeur, il n'y a pas de version web séparée.
- **Bureau (à partir d'environ 900 px)**, voir les maquettes `Web*` :
  - la barre de navigation du bas devient une **barre latérale** à gauche (logo, cinq onglets, état hors-ligne, mention fan-made) ;
  - **liste des sets** et **tirages du set** : tuiles en grille (colonnes automatiques), fil d'Ariane en haut ;
  - **cartes d'un tirage** : grille de vignettes plus large (colonnes automatiques d'environ 150 px minimum), barre de filtres et sélecteur de langue sous l'en-tête, − quantité + sous chaque vignette comme sur mobile ;
  - **page carte** : en pleine page, image et vignettes des impressions à gauche, informations et tableau des impressions à droite ; précédente / suivante dans la barre du haut ;
  - **Collection** : galerie de cartes en grand format (colonnes automatiques, taille réglable), filtres en colonne à gauche, tri et filtre par nom en haut ;
  - **Recherche** : grand champ, filtres en colonne à gauche, résultats en grille de cartes ;
  - **Stats** : tableau de bord (indicateurs en haut, blocs de ventilation dessous) ;
  - **Réglages** : sections en cartes côte à côte.
- Les filtres de couleur proposent les **quatre couleurs** du jeu (rouge, jaune, bleu, vert) ; les maquettes n'en montrent que deux, faute de données lors de leur création.
- Thème sombre (couleurs et typographies des maquettes : fond `#0D0F14`, surfaces `#161922`, accent `#46E3C8`, VF `#FFB067`, VO `#8FB4FF` ; polices Chakra Petch pour les titres, IBM Plex Sans pour le texte, IBM Plex Mono pour les numéros). Définir ces valeurs comme **variables CSS** à un seul endroit.
- Couleurs de rareté : Commune `#A3AAB9`, Peu commune `#6FCF97`, Rare `#5B9CFF`, Épique `#B98CFF`, Nova Rare `#FF9F43`, Secrète `#FF5C8A`, Iconic `#F2C94C`. La rareté est **toujours aussi écrite** (lettre ou libellé), jamais portée par la couleur seule.
- Accessibilité : zones tactiles ≥ 44 px, vrais `<button>` et `<a>`, `aria-label` sur les boutons à icône, contraste ≥ 4,5:1.
- Toutes les chaînes d'interface passent par un module de traduction (FR et EN dès le MVP).

---

## 9. Stack

- Vite + React + TypeScript strict, dans `app/`.
- Dexie (IndexedDB), Zod (validation des fichiers), vite-plugin-pwa (service worker, manifeste d'installation).
- Routage côté client : React Router.
- Pas de bibliothèque de composants lourde ; pas de backend.
- Tests Vitest sur toutes les règles du §5 (fonctions pures, sans React), avec un petit catalogue de test tiré des vraies données.

### 9.1 Portabilité (règles obligatoires)

L'app doit pouvoir passer un jour à React Native ou dans une coquille native sans réécrire sa logique. Deux règles, dès l'étape 1 :

1. **Domaine pur** : les règles du §5, les types du catalogue et de la collection, et les schémas Zod vivent dans `app/src/domain/`. Ce dossier **n'importe ni React, ni Dexie, ni aucune API du navigateur** (`window`, `document`, `localStorage`, `navigator`…). Il est testé seul.
2. **Stockage derrière une interface** : l'interface `CollectionStore` (lire, modifier une entrée, tout remplacer, exporter) est définie dans le domaine ; Dexie en est la première implémentation, dans `app/src/storage/`. Même principe pour le catalogue (`CatalogStore`) et les réglages. L'interface n'appelle jamais Dexie directement.

### 9.2 Distribution

| Étape | Moyen | Quand |
|---|---|---|
| MVP | **PWA** installable depuis `novapreem.app` (Android, PC ; iPhone via « Sur l'écran d'accueil ») | dès l'étape 1 |
| Play Store | **TWA** générée avec Bubblewrap, plus `/.well-known/assetlinks.json` sur le site | après le MVP, quand l'app est stable |
| Fonctions natives (scan de carte…) ou App Store | **Capacitor** | seulement si un besoin réel apparaît |

Conséquences pour le MVP : manifeste complet (nom, icônes 192 et 512 px dont une version *maskable*, couleurs de thème, `display: standalone`, `start_url`, `scope`), service worker qui fonctionne entièrement hors-ligne, et score PWA « installable » dans Lighthouse. Ce sont les prérequis de la TWA.

---

## 10. Étapes

Chaque étape se termine par une app qui fonctionne. Ne pas commencer la suivante tant que les critères de la précédente ne sont pas remplis.

1. **Squelette** : projet Vite/React/PWA, les cinq onglets vides avec la navigation, chargement du catalogue (depuis `catalog/dist/`) et stockage IndexedDB, état « premier lancement ».
   *Critère* : l'app s'installe sur Android, se relance hors-ligne et affiche le nombre de cartes du catalogue.
2. **Sets et saisie** : liste des sets, tirages du set en tuiles, cartes d'un tirage avec − et +, sélecteur VF/VO, annuler, filtres (toutes, manquantes, possédées, doublons), copier les manques, état de la page dans l'URL.
   *Critère* : saisir 12 cartes d'un booster en moins de 30 secondes ; les quantités survivent à un redémarrage.
3. **Page carte** : la page commune du §5.9 (impressions, quantités par langue, texte de règles, retour contextuel, précédente / suivante), ouverte depuis les cartes d'un tirage.
   *Critère* : depuis les cartes du Retail filtrées sur « Manquantes », ouvrir une carte, passer à la suivante, revenir : on retrouve le filtre, la langue et la position.
4. **Collection** : galerie de cartes, filtres (colonne sur bureau, panneau sur mobile), tri, taille des cartes, doublons avec surplus ; chaque carte ouvre la page carte.
5. **Recherche** : recherche multilingue sans accents, filtres, résultats par carte ; chaque résultat ouvre la page carte.
6. **Stats** : les quatre mesures du §5.3 et leurs ventilations.
   *Critère* : tests unitaires couvrant chaque règle, dont l'impression exclusive à un tirage et la langue absente d'un tirage.
7. **Réglages et données** : tous les réglages du §7, export, import (remplacer / fusionner, résumé, impressions inconnues), CSV.
   *Critère* : exporter, vider la base, importer, et retrouver une collection identique.
8. **États et finitions** : hors-ligne, mise à jour du catalogue, collection vide, images (cache, téléchargement complet), interface en anglais.

---

## 11. Hors périmètre du MVP

Synchronisation Google Drive (juste après le MVP, en s'appuyant sur le fichier du §4.3), journal d'ouverture de boosters, classeur virtuel 3×3, liste d'échange partageable, état et gradation des cartes, deck builder, prix et valeur, scan de carte, comptes utilisateurs, backend.

---

## 12. Questions ouvertes

- ~~Sens des suffixes `a`/`b`~~ : **résolu**. Ce sont deux illustrations de la même carte (V — Streetkid : V masculin `005a`, V féminin `005b`), voir `catalog-spec.md` §9. Elles s'affichent comme deux variantes distinctes dans la grille.
- ~~Ordre des onglets de tirage~~ : **résolu** autrement : plus d'onglets, une page de tirages en tuiles (§2.1).
- Les tirages en `demo` et `promo` restent affichés dans la page du set même quand ils ne sont pas comptés : seule la complétion change.
