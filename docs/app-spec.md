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

Barre de navigation en bas, cinq onglets, dans cet ordre : **Sets · Collection · Recherche · Stats · Réglages**. L'app s'ouvre sur **Sets**.

| Onglet | Rôle | Maquettes |
|---|---|---|
| Sets | Tout le catalogue, regroupé par set puis par tirage ; c'est là qu'on saisit | `Main` (liste), `SetGrid` (grille d'un tirage) |
| Collection | Uniquement ce qui est possédé, avec filtres et tri | `Collection` |
| Recherche | Recherche dans tous les sets et toutes les langues | `Search` |
| Stats | Complétion et chiffres de la collection | `Completion` |
| Réglages | Saisie, complétion, affichage, données | `Settings` |

Écrans hors barre : **Fiche carte** (`CardDetail`), ouverte depuis la grille, la collection ou la recherche ; **états** (`States`) : premier lancement, hors-ligne, nouveau catalogue, collection vide.

Il n'y a **pas d'onglet « Manques »** : les manques sont le filtre « Manquantes » de la grille d'un tirage, les doublons le filtre « Doublons » de Collection.

Chaque écran a une URL (routage côté client) pour que le bouton retour d'Android fonctionne.

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

- Le **tirage et la langue de saisie** par défaut viennent des Réglages (défaut : Retail, VF). Dans la grille d'un tirage, le tirage est celui de l'écran ; la langue se change avec le sélecteur VF/VO de la grille.
- **Un tap** sur une carte de la grille ajoute 1 exemplaire de l'impression (tirage, numéro, langue choisie).
- Si l'impression n'existe pas dans la langue choisie (ex. promo uniquement en VO), on n'ajoute rien : on ouvre le panneau des quantités de cette carte, qui ne liste que les langues existantes.
- **Mode retrait** : le même tap retire 1 exemplaire (jamais en dessous de 0).
- Après chaque saisie, un bandeau « +1 [nom] · VF » avec **Annuler** (annule exactement la dernière action). Le bandeau reste jusqu'à l'action suivante ou 5 s.
- Le bouton « … » d'une carte ouvre le **panneau des quantités** : une ligne par langue existante, avec − et +, et un lien vers la fiche carte.
- La **fiche carte** liste toutes les impressions de la carte, groupées par variante (tirage + numéro), une ligne par langue, avec − et +.

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

- Filtre « Manquantes » de la grille d'un tirage : variantes non possédées selon la langue sélectionnée dans la portée (toutes langues, VF, VO).
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
- Filtres : type, couleur, rareté, set, coût, RAM, possession (toutes / possédées / manquantes). Les valeurs proposées viennent du catalogue.
- La recherche s'exécute à chaque frappe, sans réseau.

### 5.7 Collection (onglet)

- Une ligne par **impression possédée** : vignette, nom, tirage et numéro, rareté, date d'ajout, quantités par langue.
- Filtres : langue (toutes / VF / VO), doublons, set, tirage, rareté, type, couleur.
- Tri : **Récents** (`lastAddedAt` décroissant, défaut), numéro, nom (ordre alphabétique français), quantité.
- Résumé en haut : nombre d'exemplaires et nombre d'impressions affichées.

### 5.8 Langue des noms

Réglage : « Langue de saisie » (défaut : les noms suivent le sélecteur VF/VO), « Toujours VF », « Toujours VO ». Si un nom n'existe pas dans la langue demandée, afficher le nom anglais.

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

- Mobile d'abord, largeur de référence 390 px ; sur grand écran, contenu centré (max ~960 px) et grille plus large (4 à 6 colonnes).
- Thème sombre (couleurs et typographies des maquettes : fond `#0D0F14`, surfaces `#161922`, accent `#46E3C8`, VF `#FFB067`, VO `#8FB4FF` ; polices Chakra Petch pour les titres, IBM Plex Sans pour le texte, IBM Plex Mono pour les numéros). Définir ces valeurs comme **variables CSS** à un seul endroit.
- Couleurs de rareté : Commune `#A3AAB9`, Peu commune `#6FCF97`, Rare `#5B9CFF`, Épique `#B98CFF`, Nova Rare `#FF9F43`, Secrète `#FF5C8A`, Iconic `#F2C94C`. La rareté est **toujours aussi écrite** (lettre ou libellé), jamais portée par la couleur seule.
- Accessibilité : zones tactiles ≥ 44 px, vrais `<button>` et `<a>`, `aria-label` sur les boutons à icône, contraste ≥ 4,5:1.
- Toutes les chaînes d'interface passent par un module de traduction (FR et EN dès le MVP).

---

## 9. Stack

- Vite + React + TypeScript strict, dans `app/`.
- Dexie (IndexedDB), Zod (validation des fichiers), vite-plugin-pwa (service worker, manifeste d'installation).
- Routage côté client (React Router ou TanStack Router).
- Pas de bibliothèque de composants lourde ; pas de backend.
- Tests Vitest sur toutes les règles du §5 (fonctions pures, sans React), avec un petit catalogue de test tiré des vraies données.

Les règles de calcul (§5) vivent dans un module pur (`app/src/domain/`) testé indépendamment de l'interface.

---

## 10. Étapes

Chaque étape se termine par une app qui fonctionne. Ne pas commencer la suivante tant que les critères de la précédente ne sont pas remplis.

1. **Squelette** : projet Vite/React/PWA, les cinq onglets vides avec la navigation, chargement du catalogue (depuis `catalog/dist/`) et stockage IndexedDB, état « premier lancement ».
   *Critère* : l'app s'installe sur Android, se relance hors-ligne et affiche le nombre de cartes du catalogue.
2. **Sets et saisie** : liste des sets et tirages, grille d'un tirage, sélecteur VF/VO, tap +1, mode retrait, annuler, panneau des quantités, filtres (toutes, manquantes, possédées, doublons), copier les manques.
   *Critère* : saisir 12 cartes d'un booster en moins de 30 secondes ; les quantités survivent à un redémarrage.
3. **Fiche carte** : toutes les impressions groupées par variante, quantités par langue, texte de règles dans la langue d'affichage.
4. **Collection** : liste, filtres, tri, doublons avec surplus.
5. **Recherche** : recherche multilingue sans accents, filtres, résultats par carte.
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
- Ordre des tirages dans la liste Sets : ordre du catalogue (`release.order`) ; à revoir quand les promos seront nombreuses.
- Les tirages en `demo` et `promo` sont-ils affichés dans Sets quand ils ne sont pas comptés ? Proposition : oui, toujours visibles, seule la complétion change.
