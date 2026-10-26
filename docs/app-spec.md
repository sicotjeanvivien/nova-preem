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
| Sets | Tout le catalogue, en trois niveaux (ci-dessous) ; c'est là qu'on saisit | `Main`, `SetGrid`, `CardDetail` / `WebSetList`, `WebSets`, `WebCard` |
| Collection | Uniquement ce qui est possédé, avec filtres et tri | `Collection` / `WebCollection` |
| Recherche | Recherche dans tous les sets et toutes les langues | `Search` / `WebSearch` |
| Stats | Complétion et chiffres de la collection | `Completion` / `WebStats` |
| Réglages | Saisie, complétion, affichage, données | `Settings` / `WebSettings` |

### 2.1 Sets : trois niveaux

1. **Liste des sets** (`/sets`) : un bloc par set avec sa progression ; un set annoncé mais absent du catalogue n'apparaît pas (la maquette montre *Edgerunners: Burn Bright* « à venir » à titre d'illustration : ne l'afficher que si le catalogue le contient).
2. **Page d'un set** (`/sets/:setId`) : toutes les cartes du set, réparties en **cinq onglets fixes**, identiques sur mobile et sur bureau :
   - **Retail** et **Beta** : un onglet par tirage du groupe `main` ;
   - **Starters**, **Démos**, **Promos** : un onglet par groupe (`starter`, `demo`, `promo`), avec un **sous-filtre** pour choisir le tirage précis (« Tous » par défaut, puis chaque tirage du groupe dans l'ordre `release.order`, ex. « The Heist — Retail », « Edgerunner Open S1 »).
   - Un onglet sans aucune impression dans le set n'est pas affiché. Chaque onglet montre son compteur (possédées / total).
   - Avec le sous-filtre « Tous », une carte présente dans plusieurs tirages du groupe apparaît une fois par impression, avec le nom du tirage sur la vignette.
   - L'onglet par défaut est celui qui contient le tirage de saisie des Réglages, sinon Retail. C'est l'écran de **saisie** (§5.1) : dans un onglet de groupe, un tap avec « Tous » ajoute l'impression de la vignette touchée.
3. **Page carte** (`/cartes/:slug`) : **une seule page**, ouverte depuis la page d'un set, la Collection ou la Recherche (§5.9).

Écrans hors barre : **états** (`States` / `WebStates`) : premier lancement, hors-ligne, nouveau catalogue, collection vide.

**Règle d'harmonisation** : mobile et bureau ont **les mêmes écrans, les mêmes fonctions et les mêmes filtres**. Seule la disposition change (§8). Une fonction présente sur une seule des deux maquettes est un oubli de maquette, pas une différence voulue.

Il n'y a **pas d'onglet « Manques »** : les manques sont le filtre « Manquantes » de la page d'un set, les doublons le filtre « Doublons » de Collection.

Chaque écran a une URL (routage côté client) pour que le bouton retour d'Android et l'historique du navigateur fonctionnent. L'onglet de tirage et les filtres d'une page de set sont dans l'URL (`?tirage=wnc-retail&filtre=manquantes`), pour que le retour depuis une page carte retrouve exactement le même état.

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

- Le **tirage et la langue de saisie** par défaut viennent des Réglages (défaut : Retail, VF). Dans la page d'un set, le tirage est l'onglet affiché ; la langue se change avec le sélecteur VF/VO de la page.
- **Un tap** sur la vignette d'une carte ajoute 1 exemplaire de l'impression (tirage de l'onglet, numéro, langue choisie), **sans quitter la page**.
- Si l'impression n'existe pas dans la langue choisie, on n'ajoute rien et on ouvre la page carte. C'est le cas courant : le FR n'existe que pour le Retail du set principal (pas de Beta, starters ni promos en FR). Quand l'onglet affiché n'existe que dans une langue, le sélecteur VF/VO est masqué.
- **Mode retrait** : le même tap retire 1 exemplaire (jamais en dessous de 0).
- Après chaque saisie, un bandeau « +1 [nom] · VF » avec **Annuler** (annule exactement la dernière action). Le bandeau reste jusqu'à l'action suivante ou 5 s.
- La **flèche** d'une vignette (et le nom de la carte) ouvre la **page carte** (§5.9).
- Sur la page carte, chaque impression a ses boutons − et +.

### 5.2 Possession

- Une **impression** est possédée si sa quantité ≥ 1.
- Une **variante** est possédée « toutes langues » si au moins une de ses impressions est possédée, possédée « en VF » si son impression FR est possédée, etc.
- Une **carte** est possédée si au moins une de ses impressions est possédée (tous tirages confondus).

### 5.3 Complétion

Les **groupes comptés** sont réglables (défaut : `main` + `starter`). Ils s'appliquent aux calculs « set jouable » et « master set » ; le calcul « par tirage » porte toujours sur le tirage choisi.

| Mesure | Dénominateur | Numérateur |
|---|---|---|
| **Set jouable** | cartes du set ayant au moins une impression dans un tirage d'un groupe compté | celles possédées dans **n'importe quelle** de ces impressions |
| **Master set** | impressions du set dans les groupes comptés (chaque langue compte) | impressions possédées |
| **Par tirage, toutes langues** | variantes du tirage | variantes possédées toutes langues |
| **Par tirage, en VF / en VO** | impressions du tirage dans cette langue | impressions possédées dans cette langue |

Conséquences :
- Une impression **exclusive à un tirage** (ex. Iconic `β168`, Beta uniquement) n'entre que dans le dénominateur de ce tirage : elle n'est jamais « manquante » ailleurs.
- Si une langue n'existe pas pour un tirage (ex. Beta en VF), le calcul « en VF » de ce tirage n'est pas proposé.
- Les pourcentages sont arrondis à l'entier **inférieur**, pour que 100 % signifie toujours « tout possédé » (99,6 % s'affiche 99 %).
- Ventilations affichées dans Stats : par type de carte (set jouable), par tirage et langue (master set), par rareté (par tirage).

### 5.4 Manques

- Filtre « Manquantes » de la page d'un set, pour l'onglet de tirage affiché : variantes non possédées selon la langue sélectionnée dans la portée (toutes langues, VF, VO).
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

- Une ligne par **impression possédée** : vignette, nom, tirage et numéro, rareté, date d'ajout, quantités par langue.
- Filtres : langue (toutes / VF / VO), doublons, set, tirage, rareté, type, couleur.
- Tri : **Récents** (`lastAddedAt` décroissant, défaut), numéro, nom (ordre alphabétique français), quantité.
- Résumé en haut : nombre d'exemplaires et nombre d'impressions affichées.

### 5.8 Langue des noms

Réglage : « Langue de saisie » (défaut : les noms suivent le sélecteur VF/VO), « Toujours VF », « Toujours VO ». Si un nom n'existe pas dans la langue demandée, afficher le nom anglais.

### 5.9 Page carte

Une seule page par carte (`/cartes/:slug`), la même quel que soit l'écran d'où l'on vient.

- **Contenu** : image de l'impression sélectionnée (par défaut, celle du tirage et de la langue d'où l'on vient, sinon la première impression Retail dans la langue d'affichage), vignettes des autres impressions pour changer d'image, nom dans la langue d'affichage et dans l'autre langue, type, couleur, RAM / coût / power quand ils existent, classifications, texte de règles avec sélecteur VF/VO.
- **Impressions** : toutes les impressions de la carte, groupées par tirage puis par numéro, une ligne par langue, avec rareté, quantité, − et +. Une impression exclusive à un tirage porte une mention (ex. « exclusive Beta »). Les artistes sont indiqués.
- **Retour contextuel** : le bouton retour ramène à l'écran d'origine, dans le même état (onglet, filtres, position de défilement) ; son libellé nomme cet écran (« Welcome to Night City · Retail », « Collection », « Recherche »). Arrivé par un lien direct, il ramène à la page du set de la carte.
- **Précédente / suivante** : uniquement en venant d'une page de set, pour parcourir les cartes **dans l'ordre et avec les filtres de cette page** (ex. seulement les manquantes du Retail). Libellés avec numéro et nom de la carte voisine.
- Textes divergents entre impressions d'une même langue (cas réels, voir `catalog-spec.md` §9) : afficher le texte de l'impression sélectionnée, c'est-à-dire `printing.printedRulesText` s'il existe, sinon `card.rulesText[langue]`.

---

## 6. Catalogue dans l'app

- Au premier lancement : téléchargement de `manifest.json` puis `catalog.json`, avec une barre de progression (maquette États 1). Tant que ce n'est pas fait, l'app n'affiche rien d'autre.
- À chaque lancement, en ligne : comparaison du `hash` du manifeste distant avec celui stocké. S'il diffère, proposer la mise à jour (maquette États 3) ; la collection n'est jamais modifiée par une mise à jour.
- **Images** : mises en cache par le service worker au fil de la navigation (stratégie cache-first). Réglage « Télécharger toutes les images » (Wi-Fi recommandé). Une image absente hors-ligne affiche un emplacement neutre avec le nom et le numéro.
- Hors-ligne : bandeau discret (maquette États 2), toutes les fonctions restent disponibles sauf la mise à jour du catalogue.
- En développement, le catalogue est servi depuis `catalog/dist/` ; l'URL de base est configurable (variable d'environnement), pour passer ensuite sur un CDN.

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
  - **liste des sets** : blocs de set en grille (2 colonnes ou plus) ;
  - **page d'un set** : onglets de tirages en haut, grille de vignettes plus large (colonnes automatiques d'environ 130 px minimum) ; un clic ajoute un exemplaire comme sur mobile ;
  - **page carte** : en pleine page, image et vignettes des impressions à gauche, informations et tableau des impressions à droite ; précédente / suivante dans la barre du haut ;
  - **Collection** : un **tableau triable** (clic sur un en-tête pour trier, second clic pour inverser), filtres en colonne à gauche, bouton d'export CSV ;
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
2. **Sets et saisie** : liste des sets, page d'un set avec onglets de tirages, sélecteur VF/VO, tap +1, mode retrait, annuler, filtres (toutes, manquantes, possédées, doublons), copier les manques, état de la page dans l'URL.
   *Critère* : saisir 12 cartes d'un booster en moins de 30 secondes ; les quantités survivent à un redémarrage.
3. **Page carte** : la page commune du §5.9 (impressions, quantités par langue, texte de règles, retour contextuel, précédente / suivante), ouverte depuis la page d'un set.
   *Critère* : depuis la page d'un set filtrée sur « Manquantes », ouvrir une carte, passer à la suivante, revenir : on retrouve l'onglet, le filtre et la position.
4. **Collection** : liste (tableau sur bureau), filtres, tri, doublons avec surplus ; chaque ligne ouvre la page carte.
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
- ~~Ordre des onglets de tirage~~ : **résolu**, cinq onglets fixes avec sous-filtre (§2.1).
- Les tirages en `demo` et `promo` restent affichés dans la page du set même quand ils ne sont pas comptés : seule la complétion change.
