# Spécification : valeur estimée de la collection

Objectif : répondre à **« combien vaut ma collection ? »**, en **ordre de grandeur**. Savoir qu'une carte vaut quelques centimes ou plusieurs euros, pas à 5 centimes près.

Ce n'est **pas** un outil d'achat ou de vente : pas de prix payé, pas de plus-value, pas d'historique, pas de liens marchands ou d'affiliation, pas d'alerte.

État des connaissances : 18/11/2026, établi sur les fichiers Cardmarket réels (jeu n° 23, fichiers du 16 et 17/11/2026) et le catalogue du 04/11/2026.

---

## 1. Source : fichiers publics de Cardmarket

Cardmarket publie chaque nuit, par jeu, deux fichiers JSON publics (sans compte ni clé ; leur API est fermée aux nouveaux comptes) :

| Fichier | Adresse |
|---|---|
| Produits (cartes) | `https://downloads.s3.cardmarket.com/productCatalog/productList/products_singles_23.json` |
| Prix | `https://downloads.s3.cardmarket.com/productCatalog/priceGuide/price_guide_23.json` |

`23` = Cyberpunk (`categoryName: "Cyberpunk Single"`, `idCategory: 1661`). Fichier de prix régénéré vers 02 h 45 (heure de Paris).

**Produits** : `{ version, createdAt, products: [{ idProduct, name, idCategory, categoryName, idExpansion, idMetacard, dateAdded }] }`. Pas de numéro de collection, pas de langue, pas de variante.

**Prix** : `{ version, createdAt, priceGuides: [{ idProduct, idCategory, avg, low, trend, avg1, avg7, avg30, avg-foil, low-foil, trend-foil, avg1-foil, avg7-foil, avg30-foil }] }`, en euros. Le fichier contient aussi les produits scellés (displays, boosters…) : ne garder que `idCategory === 1661`.

Les prix sont **toutes langues confondues** : une carte VF et la même carte VO ont le même prix. C'est accepté (ordre de grandeur) et affiché comme tel.

Règles de conduite : deux téléchargements par nuit au plus, User-Agent du projet (comme le catalogue), échec propre si le format change (schéma Zod). Les conditions de réutilisation de ces fichiers ne sont pas publiées : citer la source partout où un prix apparaît (« Prix indicatifs Cardmarket »), et retirer la fonction sur simple demande de Cardmarket.

---

## 2. Constats sur les données réelles (18/11/2026)

- 570 cartes dans 17 extensions Cardmarket ; 606 lignes de prix (cartes + scellé).
- **Extensions ↔ tirages** : 16 des 17 extensions correspondent à un tirage du catalogue. Beta et Retail ont des extensions distinctes : les extensions ajoutées le 28/08/2026 sont la Beta (Kickstarter), celles du 30/10/2026 le Retail.
- **Rattachement par nom** : nom Cardmarket et nom anglais du catalogue sont identiques, au tiret près (`Adam Smasher - Ender of Legends` / `Adam Smasher — Ender of Legends`) et aux accents près. Une seule faute dans la source : `Tetratonic Rippler` (catalogue : `Tetratronic Rippler`), dans les starters Heist.
- **Noms en double dans une extension** (88, dont 82 dans les extensions retenues) : une Legend et son Iconic, ou 005a / 005b, portent exactement le même nom. Sur le Retail (31 cas vérifiés), **l'ordre des `idProduct` suit l'ordre des numéros de collection**, sans exception, et le produit rattaché à l'Iconic est chaque fois nettement plus cher (ex. Adam Smasher 001 ≈ 0,80 €, 141 ≈ 65 €), ce qui confirme le rattachement.
- **Champ de prix** : 290 cartes ont un `trend`, 244 seulement un `trend-foil` (les vendeurs ne déclarent pas tous le foil de la même façon), 29 seulement un `low` (annonces sans vente), 7 rien.
- **Non couverts** : le tirage `edgerunner-open-s1` (53 impressions) n'existe pas sur Cardmarket ; `set1-promos` n'y a que 3 cartes sur 6. L'extension Cardmarket `6722` (35 cartes, prix jusqu'à 1 300 €) ne correspond à aucun tirage du catalogue (probablement des cartes Kickstarter hors catalogue) : ignorée et signalée.
- Couverture obtenue avec l'algorithme du §3 : **534 variantes rattachées sur 591** (90 %), dont **513 avec un prix** ; 100 % des tirages principaux, starters, démos, avant-premières, box toppers et tournois présents sur Cardmarket. Non rattachées : `edgerunner-open-s1` et 4 impressions de `set1-promos` (Lucyna 004a/004b absentes, Rebecca 005/007 en un seul produit).
- Répartition : prix médian ≈ 0,20 €, 173 variantes sous 0,10 €, 113 à 10 € ou plus.

---

## 3. Rattachement (pipeline)

Fichier de correspondance tenu à la main, versionné : `catalog/prices/cardmarket.json`.

```json
{
  "game": 23,
  "category": 1661,
  "expansions": {
    "wnc-beta": 6714, "wnc-retail": 6761,
    "heist-starter-beta": 6715, "heist-starter-retail": 6762,
    "embracing-power-starter-beta": 6716, "embracing-power-starter-retail": 6763,
    "merc-demo": 6720, "arasaka-demo": 6721,
    "prerelease-beta": 6718, "prerelease-retail": 6765,
    "box-toppers-beta": 6717, "box-toppers-retail": 6764,
    "night-city-brawl-s1": 6953, "night-city-showdown-s1": 6954,
    "set1-promos": 6719, "judge-promos": 6952
  },
  "ignoredExpansions": { "6722": "cartes Kickstarter absentes du catalogue" },
  "nameAliases": { "Tetratonic Rippler": "Tetratronic Rippler" },
  "overrides": { }
}
```

Algorithme, pour chaque tirage présent dans `expansions` :

1. Prendre les impressions **anglaises** du tirage, triées par `sortKey`, et les produits Cardmarket de l'extension, triés par `idProduct`.
2. Clé de rattachement : nom normalisé (alias appliqués, NFD sans accents, minuscules, seulement lettres et chiffres).
3. Pour chaque clé : si le nombre d'impressions et de produits est **égal**, rattacher dans l'ordre (1er ↔ 1er…). Sinon : **ne rien rattacher** pour cette clé, et le signaler.
4. `overrides` (`variantKey → idProduct`) l'emporte sur tout : c'est la correction manuelle d'un cas signalé.
5. Contrôle : dans un groupe de même nom, une impression Iconic (`rarity.iconic`) moins chère que la version normale est **signalée** dans le rapport (sans la retirer).
6. Le prix vaut pour la **variante** (`variantKey`) : toutes ses langues partagent le prix.

Prix retenu pour un produit, dans l'ordre : `trend` s'il est > 0, sinon `trend-foil` s'il est > 0, sinon **pas de prix**. `low` seul (annonces sans vente) est ignoré : trop peu fiable.

Le rapport (`prices-report.json`, non publié) liste : tirages sans extension, clés non rattachées (avec les deux effectifs), produits Cardmarket orphelins, contrôles Iconic en échec, nombre de variantes avec et sans prix. Comme pour le catalogue : **signaler, jamais deviner**.

---

## 4. Fichier publié : `prices.json`

```json
{
  "schemaVersion": 1,
  "source": "cardmarket",
  "currency": "EUR",
  "sourceDate": "2026-11-17T02:51:32+01:00",
  "generatedAt": "2026-11-17T04:10:00Z",
  "catalogVersion": "2026-11-04.2",
  "prices": { "wnc-retail#001": 0.8, "wnc-retail#141": 64.85 }
}
```

- Clé : `variantKey` du catalogue. Valeur : euros, deux décimales. Variante sans prix : absente.
- Fichier séparé du catalogue : les prix changent chaque nuit, le catalogue rarement. Il ne fait pas changer la version du catalogue.
- Quelques kilo-octets (gzip) ; pas de manifeste : en-tête `Cache-Control: max-age=3600` et champ `sourceDate`.

### Publication

- Projet Cloudflare Pages dédié `nova-preem-prices`, domaine `prices.nova-preem.app` (CORS ouvert, comme le catalogue). Un projet séparé, parce qu'un déploiement Pages remplace tout le site et que le catalogue (images) est publié à la main.
- Workflow GitHub `prices.yml` : **chaque nuit à 04 h 30 (Paris)** et à la demande. Télécharge les deux fichiers, construit `prices.json` à partir de `catalog/dist/catalog.json` (versionné) et de `catalog/prices/cardmarket.json`, puis `wrangler pages deploy`. Si la validation échoue ou si la couverture tombe sous 80 % des variantes rattachées la veille, **ne pas publier** et faire échouer le workflow (le dernier fichier publié reste en ligne).
- Variable GitHub `PRICES_BASE_URL` (barre finale), exposée à l'app en `VITE_PRICES_BASE_URL`. Vide : la fonction est absente de l'app.
- Code dans `catalog/src/prices/` (adaptateur Cardmarket isolé, comme Netdeck), commande `pnpm prices`, tests Vitest sur des extraits réels des deux fichiers.

---

## 5. Dans l'app

### Chargement

- Au lancement en ligne, si les prix ont plus de 12 h : télécharger `prices.json`, valider (Zod), enregistrer dans IndexedDB (store `catalog`, clé `prices`). Hors-ligne : derniers prix connus.
- Les prix ne sont **jamais** demandés à Cardmarket par l'app : tout vient de notre domaine (la politique de confidentialité le promet).
- Réglage **« Prix indicatifs »** (Réglages → Affichage), activé par défaut. Désactivé : aucun prix nulle part et plus de téléchargement.

### Arrondi (règle unique, dans `app/src/domain/`)

Prix d'une carte :

| Prix réel | Affichage |
|---|---|
| inconnu | « — » (aide : « Pas encore de prix ») |
| < 0,10 € | « < 0,10 € » |
| 0,10 € à 1 € | arrondi à 0,10 € : « ≈ 0,30 € » |
| 1 € à 10 € | arrondi à 0,50 € : « ≈ 2,50 € » |
| 10 € à 100 € | arrondi à 1 € : « ≈ 65 € » |
| ≥ 100 € | arrondi à 10 € : « ≈ 340 € » |

Valeur d'un ensemble (somme des prix réels × quantités, puis arrondi) : < 100 € à 1 € près, < 1 000 € à 10 € près, au-delà à 50 € près. Format français (`≈ 1 250 €`) ou anglais (`≈ €1,250`) selon la langue de l'interface. Les cartes sans prix ne comptent pas ; leur nombre est affiché.

### Où apparaissent les prix

- **Page carte** : à droite de chaque impression, son prix arrondi, en gris discret. Sous la liste : « Prix indicatifs Cardmarket, toutes langues confondues · 17/11 ».
- **Stats** : une carte « Valeur estimée » en tête : total arrondi, nombre de cartes sans prix, date des prix ; puis la valeur par tirage (barres) et les 5 cartes possédées les plus chères (chacune ouvre la page carte).
- **Collection** : tri **« Valeur »** (décroissante, sans prix à la fin) ; prix arrondi dans la ligne d'information de chaque carte (« Retail · #003 · ≈ 14 € ») ; valeur de la **sélection affichée** (filtres compris) à la fin du résumé en haut (« 18 ex. · 10 impressions · ≈ 90 € »). Filtres inchangés.
- **Pas de prix** sur la grille de saisie des cartes d'un tirage, ni dans Recherche (écrans de saisie et de recherche, pas d'estimation).
- Prix de plus de 7 jours (workflow en panne, appareil hors-ligne longtemps) : la date passe en ambre avec « Prix anciens ».

### Portabilité

Le calcul (rattachement prix ↔ impressions possédées, arrondis, totaux) est dans `app/src/domain/`, pur et testé. Le stockage passe par une interface `PriceStore` dont Dexie est une implémentation. **Le fichier de collection ne change pas** (les prix ne sont pas des données de l'utilisateur).

---

## 6. Textes légaux

À modifier dans `docs/legal/{fr,en}/` **dans la même livraison que l'étape 4** (pas avant : les pages ne doivent pas annoncer une fonction absente ; pas après : règle de `CLAUDE.md`). Mettre à jour la date « Dernière mise à jour ».

- **À propos** (`about.md`), section « Sources et crédits », nouvelle puce :
  - FR : « Prix indicatifs : Cardmarket (fichiers publics de tendance des prix), toutes langues confondues, mis à jour chaque nuit. Nova Preem n'est pas lié à Cardmarket. »
  - EN : “Indicative prices: Cardmarket (public price trend files), all languages combined, updated every night. Nova Preem is not affiliated with Cardmarket.”
  - Et dans « Ce que fait l'app », puce : FR « Estimer la valeur de votre collection, en ordre de grandeur. » / EN “Estimate what your collection is worth, as a rough order of magnitude.”
- **Mentions légales** (`legal-notice.md`), § Propriété intellectuelle, nouvelle puce : la même phrase « Prix indicatifs… ».
- **CGU** (`terms.md`), § Responsabilité, phrase ajoutée : FR « Les prix affichés sont des estimations indicatives, sans garantie ; ce ne sont ni des offres ni des conseils. » / EN “Prices shown are indicative estimates, without any guarantee; they are neither offers nor advice.”
- **Confidentialité** (`privacy.md`), § Quand vous utilisez le site : remplacer « Le catalogue, les images et les polices sont servis par le site lui-même » par « Le catalogue, les prix indicatifs, les images et les polices sont servis par le site lui-même » (EN : “The catalog, indicative prices, images and fonts…”). Aucune nouvelle donnée personnelle.

---

## 7. Étapes

1. **Pipeline** : adaptateur Cardmarket, `cardmarket.json`, rattachement, rapport, `pnpm prices`, tests.
   *Critère* : le rapport retrouve les chiffres du §2 (534 variantes rattachées, Tetratonic rattachée par l'alias, 82 groupes de doublons rattachés, 513 variantes avec prix, aucun contrôle Iconic en échec) sur les fichiers du 17/11.
2. **Publication** : projet Pages, domaine, workflow nocturne, garde-fou de couverture. *Critère* : deux nuits de suite publiées sans intervention ; un fichier volontairement cassé n'est pas publié.
3. **App** : chargement, `PriceStore`, arrondis (tests de toutes les bornes du tableau), réglage « Prix indicatifs ».
4. **Écrans** : page carte, Stats, tri Collection, mentions de source ; textes légaux. *Critère* : le total de Stats est égal à la somme des prix réels × quantités de la collection de démonstration, arrondie selon la règle.
