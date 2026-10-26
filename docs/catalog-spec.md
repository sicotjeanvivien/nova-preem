# Spécification du pipeline catalogue

Objectif : produire un **catalogue normalisé**, versionné et autonome (un fichier JSON + des images), à partir de la base de cartes officielle du Cyberpunk TCG. L'app le télécharge et l'utilise hors-ligne.

État des connaissances : 26/10/2026, établi sur une page réelle de l'API (60 cartes sur 151, 302 impressions). Tout ce qui est marqué **[à vérifier]** doit être confirmé sur l'ensemble des données, et tout écart doit être signalé.

---

## 1. Source de données

La base officielle (https://cyberpunktcg.com/cards) est fournie par **Netdeck.gg**. Netdeck expose une API JSON **non documentée**, publique, sans authentification. Une API officielle est annoncée (« Coming Soon ») ; le propriétaire du projet est inscrit sur la liste d'attente.

### Endpoints

| Usage | Requête |
|---|---|
| **Liste paginée (à utiliser)** | `GET https://api.netdeck.gg/api/cards/cyberpunk?limit=60&offset={0,60,120}` |
| Détail d'une carte (non nécessaire) | `GET https://api.netdeck.gg/api/cards/cyberpunk/{slug}?printing={printingId}` |

Réponse de la liste :

```json
{ "items": [ /* Card */ ], "total": 151, "limit": 60, "offset": 0 }
```

- Paginer avec `offset` jusqu'à `offset >= total`. Ne pas coder 151 en dur.
- `limit` est plafonné à **100** par l'API, sans erreur (voir §9). Le pipeline utilise des pages de **20 cartes** pour pouvoir télécharger les images d'une page avant l'expiration de leurs URL (voir §6).
- Chaque élément de `items` est la carte **complète avec toutes ses impressions** (même format que l'endpoint de détail). Le détail n'est donc pas nécessaire.
- Le paramètre `?printing=` du détail ne change que l'impression « mise en avant » au premier niveau de l'objet ; le tableau `printings` est toujours complet.

### Règles de bonne conduite (obligatoires)

- Au plus **1 requête par seconde**, séquentielles.
- **Cache local** des réponses brutes (`catalog/.cache/`, ignoré par git) ; option `--refresh` pour forcer le re-téléchargement.
- User-Agent : `nova-preem-catalog/<version> (+https://github.com/sicotjeanvivien/nova-preem)`.
- Exécution prévue : à la demande, puis une fois par semaine au maximum (CI plus tard).
- Tout l'accès réseau est isolé dans un **adaptateur de source** (`catalog/src/sources/netdeck.ts`) qui renvoie des objets validés. Le reste du pipeline ne connaît pas Netdeck.

---

## 2. Format source

### Card (élément de `items`)

Champs utiles (les autres sont ignorés) :

| Champ | Exemple | Notes |
|---|---|---|
| `id` | `"56947a14-…"` | UUID de la carte (« entité »). **Identifiant stable de la carte.** |
| `slug` | `"johnny-silverhand-rocking-renegade"` | |
| `canonical_name` | `"Johnny Silverhand — Rocking Renegade"` | Nom anglais complet. |
| `canonical_base_name` | `"Johnny Silverhand"` | Nom sans sous-titre. |
| `card_type` | `"Legend"` | Observé : `Legend`, `Unit`, `Gear`, `Program`. |
| `color` | `"Red"` | Observé : `Red`, `Yellow`. **[à vérifier]** la liste complète. → Red, Yellow, Blue, Green (§9). |
| `classifications` | `["Merc","Rocker","Samurai"]` | Tags. |
| `keywords` | `[]` | |
| `cost`, `power`, `ram` | `null`, `null`, `2` | Nullables (ex. Legend sans coût). |
| `is_eddiable` | `true` | |
| `official_rules_text_en` | `"2 €$, {Spend} …"` | Texte de règles anglais officiel. |
| `legality` | `"legal"` | |
| `printings` | `[Printing]` | **Toutes** les impressions. |

⚠️ Les champs de premier niveau `name`, `subname`, `display_name`, `rules_text`, `language`, `set`, `rarity`, `image_url`, `artist`, `print_number` décrivent **l'impression mise en avant**, pas la carte. Leur langue varie. **Ne pas les utiliser** : tout prendre dans `printings` et dans les champs `canonical_*` / `official_rules_text_en`.

### Printing (élément de `printings`)

| Champ | Exemple | Notes |
|---|---|---|
| `id` | `"7f03795b-…"` | UUID de l'impression. **Identifiant stable référencé par les collections.** |
| `collector_number` | `"003"`, `"β003"`, `"005a"` | Numéro imprimé. Préfixe `β` pour la Beta. |
| `set.code` / `set.name` | `"welcometonightcityretail-fr"` / `"Welcome to Night City — Retail — FR"` | **Édition** au sens Netdeck (voir §3). |
| `rarity` | `"Secret"` | Voir §4. Propre à l'impression. |
| `language` | `"en"` / `"fr"` | **Source de vérité pour la langue.** |
| `localized_name` | `"Johnny Silverhand — Rock'n'Rebelle"` | `null` en anglais. |
| `printed_rules_text` | texte dans la langue de l'impression | |
| `official_rules_text` | texte officiel à jour (errata) | `null` en FR observé. |
| `artist` | `"Daniel Valaisis"` | |
| `finish` | `null` | Toujours `null` observé. À conserver (foils futurs). |
| `image_url` | URL CloudFront **signée** (`?Expires=…&Signature=…`) | Expire au bout de quelques jours. |
| `source_image_url` | même URL **sans signature** | Inaccessible (403) : inutilisable (voir §9). |

### Exemple réel (abrégé)

```json
{
  "id": "56947a14-0b1e-4c3d-89e0-17839bcf4280",
  "slug": "johnny-silverhand-rocking-renegade",
  "canonical_name": "Johnny Silverhand — Rocking Renegade",
  "canonical_base_name": "Johnny Silverhand",
  "card_type": "Legend", "color": "Red",
  "classifications": ["Merc", "Rocker", "Samurai"],
  "cost": null, "power": null, "ram": 2,
  "official_rules_text_en": "2 €$, {Spend} A friendly Unit can attack spent rival Units the turn it's played. …",
  "printings": [
    { "id": "a8a7d286-…", "collector_number": "003",  "set": { "code": "welcometonightcityretail" },    "rarity": "Secret",        "language": "en", "localized_name": null, "artist": "Daniel Valaisis" },
    { "id": "1159e69c-…", "collector_number": "β003", "set": { "code": "welcometonightcitybeta" },      "rarity": "Secret",        "language": "en", "localized_name": null, "artist": "Daniel Valaisis" },
    { "id": "4f8fbab4-…", "collector_number": "β168", "set": { "code": "welcometonightcitybeta" },      "rarity": "Iconic Secret", "language": "en", "localized_name": null, "artist": "Divebound Studio" },
    { "id": "7f03795b-…", "collector_number": "003",  "set": { "code": "welcometonightcityretail-fr" }, "rarity": "Secret",        "language": "fr", "localized_name": "Johnny Silverhand — Rock'n'Rebelle", "artist": "Daniel Valaisis",
      "printed_rules_text": "2 €$, {Spend} Une Unité alliée peut attaquer une Unité rivale épuisée le tour où elle est jouée. …" }
  ]
}
```

---

## 3. Normalisation : décomposer l'« édition » Netdeck

**Problème :** le `set.code` de Netdeck mélange plusieurs axes. `welcometonightcityretail-fr` est une édition à part entière au même niveau que `welcometonightcityretail`, alors que pour un collectionneur c'est **la même carte, au même numéro, dans une autre langue**.

**Décision :** décomposer chaque édition en **set logique + tirage (release) + langue**, et classer chaque release dans un **groupe** qui sert à la complétion.

| `set.code` Netdeck | Set | Release (tirage) | Langue | Groupe |
|---|---|---|---|---|
| `welcometonightcitybeta` | `wnc` | `wnc-beta` | en | `main` |
| `welcometonightcityretail` | `wnc` | `wnc-retail` | en | `main` |
| `welcometonightcityretail-fr` | `wnc` | `wnc-retail` | **fr** | `main` |
| `theheistbetastarterdeck` | `wnc` | `heist-starter-beta` | en | `starter` |
| `theheistretailstarterdeck` | `wnc` | `heist-starter-retail` | en | `starter` |
| `embracingpowerbetastarterdeck` | `wnc` | `embracing-power-starter-beta` | en | `starter` |
| `embracingpowerretailstarterdeck` | `wnc` | `embracing-power-starter-retail` | en | `starter` |
| `mercdemodeck` | `wnc` | `merc-demo` | en | `demo` |
| `arasakademodeck` | `wnc` | `arasaka-demo` | en | `demo` |
| `boxtoppersbeta` | `wnc` | `box-toppers-beta` | en | `promo` |
| `boxtoppersretail` | `wnc` | `box-toppers-retail` | en | `promo` |
| `prereleasebeta` | `wnc` | `prerelease-beta` | en | `promo` |
| `prereleaseretail` | `wnc` | `prerelease-retail` | en | `promo` |
| `PRM01` | `wnc` | `set1-promos` | en | `promo` |
| `judgepromos` | `wnc` | `judge-promos` | en | `promo` |
| `edgerunneropens1` | `wnc` | `edgerunner-open-s1` | en | `promo` |
| `nightcitybrawls1` | `wnc` | `night-city-brawl-s1` | en | `promo` |
| `nightcityshowdowns1` | `wnc` | `night-city-showdown-s1` | en | `promo` |

Ces 18 codes sont ceux exposés par les filtres du site au 26/10/2026.

Règles :
- La correspondance est une **table explicite** dans le code (`catalog/src/editions.ts`), pas une heuristique. Un `set.code` inconnu **ne fait pas planter** le pipeline : l'impression est ajoutée dans une release `unknown-<code>` et signalée dans le rapport, pour qu'on complète la table.
- La **langue vient de `printing.language`**, jamais du suffixe `-fr`. Si les deux se contredisent, le signaler.
- Les variantes FR futures (starters FR, promos FR…) apparaîtront comme de nouveaux codes : elles s'ajoutent à la table en pointant vers la même release avec `lang: fr`.
- **[à vérifier]** le rattachement de toutes les releases au set `wnc` : à confirmer pour les promos d'organized play (EO, Brawl, Showdown). Le set 2 (*Edgerunners: Burn Bright*, printemps 2027) aura son propre set. → Confirmé (§9).

### Faits observés sur la numérotation

- **Chaque release a sa propre numérotation.** Les starters sont numérotés dans le deck (`001`, `002`…), les promos dans leur série. Exemple : Chrome Fang = `008` en Retail, `002` dans le starter Embracing Power.
- **Beta et Retail ont la même numérotation**, au préfixe `β` près (`β003` ↔ `003`), y compris pour les starters et les Box Toppers.
- **Retail EN et Retail FR ont exactement les mêmes numéros** : vérifié sur les 60 cartes (67 impressions de chaque côté).
- Certaines impressions n'existent que dans **un seul tirage** : ex. l'Iconic `β168` de Johnny Silverhand existe en Beta, pas en Retail.
- Certaines cartes **n'existent que dans un starter** (ex. *Yorinobu Arasaka — Embracing Destruction*), sans impression dans le set principal.
- Les suffixes `a`/`b` (`005a`, `005b`) n'ont été vus que sur *V — Streetkid*. **[à vérifier]** leur sens (deux arts ? recto/verso ?). Ils font partie du numéro et ne doivent pas être retirés. → Deux illustrations (§9).
- La clé `(card.id, set.code, collector_number, language)` est unique sur l'échantillon. **[à vérifier]** sur l'ensemble. → Confirmé (§9).

### Rattachement VO ↔ VF

Deux impressions sont **la même impression dans deux langues** si elles ont : même `card.id`, même **release** (après décomposition), même `collector_number` normalisé, et des langues différentes.

- `collector_number` normalisé = numéro sans le préfixe `β` (le préfixe est porté par la release, il reste stocké tel quel sur l'impression).
- On regroupe ces impressions sous une **variante** (`variantKey = release + numéro`) : c'est l'unité de base de la complétion « toutes langues confondues ».
- Une variante qui n'existe que dans une langue est normale (promos EN seulement) : pas d'alerte. En revanche, dans une release qui existe en EN et en FR, une impression sans équivalent dans l'autre langue est **signalée**.

---

## 4. Raretés

Valeurs observées : `Common`, `Uncommon`, `Rare`, `Epic`, `Nova Rare`, `Secret`, `Iconic Legend`, `Iconic Secret`, `Iconic Other`.

- La rareté est portée par **l'impression** (une même carte peut changer de rareté selon la release : ex. Nova Rare pour les promos).
- Normaliser en codes stables (`common`, `uncommon`, `rare`, `epic`, `nova-rare`, `secret`, `iconic-legend`, `iconic-secret`, `iconic-other`) avec un ordre de tri explicite.
- Ajouter un booléen `iconic` (art alternatif) dérivé des trois raretés `Iconic *`.
- Une rareté inconnue est conservée telle quelle et **signalée**.

---

## 5. Format de sortie

Fichier unique `catalog/dist/catalog.json`, plus un manifeste `catalog/dist/manifest.json` et un rapport `catalog/dist/report.json`.

### catalog.json

```ts
interface Catalog {
  schemaVersion: 1;
  generatedAt: string;          // ISO 8601 : date des données (= source.fetchedAt), pas l'heure du build, pour qu'un même cache donne un fichier identique
  source: { name: "netdeck"; fetchedAt: string };
  languages: LanguageCode[];    // ["en", "fr"]
  sets: Set[];
  releases: Release[];
  rarities: Rarity[];
  cards: Card[];
  printings: Printing[];
}

type LanguageCode = "en" | "fr" | string;
type ReleaseGroup = "main" | "starter" | "demo" | "promo" | "unknown"; // "unknown" : code d'édition absent de la table

interface Set {
  id: string;                   // "wnc"
  name: Record<LanguageCode, string>;   // { en: "Welcome to Night City", fr: "Welcome to Night City" }
  order: number;
}

interface Release {
  id: string;                   // "wnc-retail"
  setId: string;                // "wnc"
  name: Record<LanguageCode, string>;
  group: ReleaseGroup;
  languages: LanguageCode[];    // langues dans lesquelles cette release existe
  sourceCodes: string[];        // codes Netdeck rattachés, ex. ["welcometonightcityretail", "welcometonightcityretail-fr"]
  order: number;
}

interface Rarity {
  id: string;                   // "nova-rare"
  name: Record<LanguageCode, string>;
  iconic: boolean;
  order: number;
}

interface Card {
  id: string;                   // UUID Netdeck de la carte
  slug: string;
  type: "legend" | "unit" | "gear" | "program" | string;
  color: string | null;         // "red", "yellow"…
  classifications: string[];
  keywords: string[];
  cost: number | null;
  power: number | null;
  ram: number | null;
  eddiable: boolean;
  legal: boolean;               // legality === "legal" (Rebecca — Having a Moment est "not-legal")
  name: Record<LanguageCode, string>;      // nom complet par langue ("Johnny Silverhand — Rock'n'Rebelle")
  baseName: Record<LanguageCode, string>;  // nom sans sous-titre, si disponible
  rulesText: Record<LanguageCode, string>; // texte par langue (absent si la carte n'a pas de texte)
}

interface Printing {
  id: string;                   // UUID Netdeck de l'impression — référencé par les collections
  cardId: string;
  releaseId: string;
  variantKey: string;           // "wnc-retail#003" : identique pour la VO et la VF
  language: LanguageCode;
  collectorNumber: string;      // tel qu'imprimé : "β003", "005a"
  sortKey: string;              // numéro triable (zéro-padding, suffixes gérés)
  rarityId: string;
  artist: string | null;
  finish: string | null;
  image: {                      // null si l'image n'a pas été téléchargée (anomalie missing-image)
    path: string;               // "{printingId}.webp", relatif à la base d'URL des images
    thumbPath: string;          // "thumbs/{printingId}.webp", miniature de 256 px de large
    width: number;              // dimensions de l'image pleine (733×1024 au 26/10/2026)
    height: number;
  } | null;
  sourceCode: string;           // set.code Netdeck d'origine, pour traçabilité
  printedRulesText?: string;    // texte imprimé, présent seulement s'il diffère de card.rulesText[language]
}
```

Règles :
- Tableaux **triés de façon déterministe** (sets, releases et raretés par `order` ; cartes par nom anglais ; impressions par release, `sortKey`, langue) et JSON stable : deux exécutions sur les mêmes données doivent produire un fichier **identique** (diff git lisible).
- Pas d'URL signée dans le catalogue.
- `name` / `baseName` / `rulesText` d'une carte en `en` : `canonical_name` / `canonical_base_name` / `official_rules_text_en` (texte à jour, errata compris).
- Pour les autres langues, on part d'une **impression de référence** : de préférence une impression non-Iconic d'une release du groupe `main`, sinon la première dans l'ordre des impressions. `name` vient de son `localized_name` et `rulesText` de son `printed_rules_text`.
- Les impressions Iconic omettent le texte de rappel : une divergence de texte n'est signalée qu'**entre impressions non-Iconic** d'une même langue.
- `printedRulesText` d'une impression : son `printed_rules_text`, **uniquement s'il diffère** du texte de la carte dans la même langue (absent sinon, pour ne pas alourdir le catalogue). Au 26/10/2026 : 9 impressions, à savoir les 7 Iconic FR sans texte de rappel, et *Overwatch* EN `093` et `β165`. Une divergence de **nom** est signalée entre toutes les impressions d'une même langue.
- `baseName` dans une autre langue : si le nom anglais a un sous-titre, c'est la partie du nom localisé avant « — », qui doit apparaître exactement une fois ; sinon c'est le nom localisé entier, qui ne doit pas contenir « — ». Tout cas qui ne suit pas cette règle est signalé, et `baseName` est alors omis pour cette langue (vérifié sur 100 % des données au 26/10/2026, voir §9).
- Les noms de sets et de releases en français sont saisis à la main dans la table des éditions (par défaut identiques à l'anglais).

### manifest.json

```json
{ "schemaVersion": 1, "version": "2026-10-26.1", "hash": "sha256:…", "generatedAt": "…", "counts": { "cards": 151, "printings": 0 } }
```

L'app compare `version`/`hash` au démarrage pour savoir si elle doit retélécharger le catalogue.

- `hash` : SHA-256 du contenu exact de `catalog.json`.
- `version` : `AAAA-MM-JJ.N`, où la date est celle de `generatedAt`. Elle est **conservée** si le hash n'a pas changé depuis le manifeste précédent. Sinon, `N` est incrémenté dans la même journée, ou repart à 1 un autre jour.

### report.json

Liste des anomalies, sans faire échouer le pipeline : codes d'édition inconnus, raretés inconnues, impressions VO/VF sans équivalent, contradictions de langue, textes divergents, clés dupliquées, images manquantes. Le pipeline affiche un résumé en fin d'exécution.

```ts
interface ReportFile {
  schemaVersion: 1;
  generatedAt: string;
  summary: { code: string; severity: "warning" | "info"; count: number }[];
  anomalies: { code: string; severity: "warning" | "info"; message: string; context: Record<string, unknown> }[];
}
```

- `warning` : donnée suspecte, à corriger dans les tables ou à remonter à la source.
- `info` : situation normale mais notable (Iconic propre à la Beta, trou de numérotation…).
- Les codes sont listés dans `catalog/src/report.ts`. Les messages sont en français et triés de façon déterministe.

Le pipeline **échoue** (code de sortie non nul) seulement si : la validation Zod échoue, `total` ne correspond pas au nombre de cartes reçues, ou des identifiants (carte ou impression) sont dupliqués.

---

## 6. Images

- Les URL d'image sont **signées et expirent** : le catalogue ne doit jamais les contenir.
- Les URL signées expirent **environ 5 minutes** après la réponse de l'API, et `source_image_url` (sans signature) est refusée (403) : voir §9.
- Phase 1 (maintenant) : télécharger les images dans `catalog/dist/images/{printingId}.webp`, avec les mêmes règles de politesse. Dossier ignoré par git.
  - Le crawl procède **page par page (20 cartes, soit environ 100 images)** : il télécharge une page, puis immédiatement les images manquantes de cette page.
  - Si une URL a expiré (date `Expires` dépassée ou réponse 403), la page est re-demandée une fois pour obtenir des URL fraîches.
  - Cache : une image déjà présente n'est pas retéléchargée, sauf si le nom du fichier source (`render-<hash>.webp`) a changé, ce qui signale une illustration modifiée.
- Générer aussi une miniature de 256 px de large pour les grilles : `images/thumbs/{printingId}.webp` (sharp, WebP qualité 80, environ 18 Ko). Une image source qui ne serait pas en WebP est convertie.
- `images/index.json` associe chaque impression à la version source de son image (`render-<hash>.webp`) et à ses dimensions. `pnpm build` le lit pour remplir `image`. Une image absente donne une anomalie `missing-image`, une image dont l'illustration a changé à la source une anomalie `outdated-image`.
- En développement, l'app sert `catalog/dist/` : la base d'URL des images est alors `images/`.
- Phase 2 (plus tard) : publication des images sur un stockage objet (Cloudflare R2 ou équivalent). Le champ `image.path` reste relatif pour que seule la base d'URL change.

---

## 7. Organisation du code

```
catalog/
  package.json          scripts : "crawl", "build", "test"
  src/
    sources/types.ts    format neutre (SourceCard, SourcePrinting) : le reste du pipeline ne connaît que lui
    sources/netdeck.ts  adaptateur : pagination, cache, validation Zod, conversion vers le format neutre
    http.ts             client HTTP poli (espacement, User-Agent, reprise sur 429/5xx)
    model.ts            types du catalogue de sortie (§5)
    editions.ts         table set.code → set / release / langue / groupe
    rarities.ts         table des raretés
    normalize.ts        format neutre → modèle du catalogue, variantKey, rattachement VO/VF, contrôles, tri déterministe
    images.ts           stockage local des images, miniatures, index des versions, rattachement au catalogue
    crawl.ts            commande crawl : pages + images page par page, rechargement des pages expirées
    paths.ts            emplacements du cache et de dist/
    report.ts           collecte des anomalies
    build.ts            orchestration, écriture de catalog.json / manifest.json / report.json
  test/
    fixtures/           réponses réelles (tronquées) de l'API
  .cache/               (gitignore) réponses brutes
  dist/                 (gitignore pour images/, catalog.json commité à terme pour revue)
```

Commandes attendues :
- `pnpm crawl` : télécharge les données (avec cache, `--refresh` pour tout re-télécharger) et les images manquantes ou modifiées ;
- `pnpm build` : génère le catalogue à partir du cache, sans réseau ;
- `pnpm test` : tests de normalisation sur les fixtures.

---

## 8. Critères d'acceptation

1. `pnpm crawl && pnpm build` produit un catalogue de **151 cartes** (ou le `total` annoncé) avec toutes leurs impressions.
2. Les 18 éditions connues sont mappées ; aucune impression ne finit en `unknown-*`, ou elles sont listées dans le rapport.
3. Pour la release `wnc-retail`, chaque `variantKey` a une impression `en` et une `fr` ; les exceptions sont dans le rapport.
4. Deux builds successifs sur le même cache produisent un `catalog.json` identique.
5. Aucune URL signée dans le catalogue ; chaque impression a une image locale ou une anomalie dans le rapport.
6. Les points **[à vérifier]** de ce document ont une réponse, notée dans une section « Constats » ajoutée en fin de fichier.

---

## 9. Constats (26/10/2026, sur l'ensemble des données)

Établis sur les 3 pages de la liste (`limit=60`) : **151 cartes, 751 impressions** (583 EN, 168 FR). Les sondages ponctuels ont coûté 7 requêtes au total.

### Réponses aux points [à vérifier]

| Point | Constat |
|---|---|
| `limit` maximal | **100**, plafonné sans erreur : `limit=200` renvoie 100 éléments avec `"limit": 100`. Il faut paginer sur `items.length`, pas sur le `limit` demandé. Le contenu et l'ordre sont identiques quelle que soit la taille de page. |
| Couleurs | `Red` (38), `Yellow` (37), `Blue` (38), `Green` (38). Toutes les cartes ont une couleur. |
| `source_image_url` | **Inaccessible** : `403 MissingKey` (CloudFront exige la signature). |
| Durée de validité de `image_url` | ⚠️ **Environ 5 minutes**, pas quelques jours. `Expires` vaut l'heure de la réponse + 5 min (arrondie à 10 s). Voir « Écarts ». |
| Images | WebP 733×1024, environ 110 Ko (~80 Mo pour les 751). `Cache-Control: immutable`. Le nom du fichier (`render-<hash>.webp`) change quand l'image change. |
| Rattachement des promos au set `wnc` | Oui : toutes les cartes des 9 releases promo (EO, Brawl, Showdown, Judge, PRM01, Box Toppers, Prerelease) existent dans le set principal, un starter ou un demo deck de WNC. Seule exception : *Rebecca — Having a Moment* (voir plus bas). Les cartes portent aussi la mention `MS01 - WNC`. |
| Suffixes `a`/`b` | **Deux illustrations** de la même carte : *V — Streetkid*, V masculin (`005a`) et V féminin (`005b`). Même texte, même rareté, même artiste. Présents en Beta, Retail EN et Retail FR. Le suffixe est imprimé sur la carte. |
| Unicité de `(card.id, set.code, collector_number, language)` | Confirmée. Aucun doublon d'identifiant de carte ou d'impression, ni de slug ou de `canonical_name`. |
| Codes d'édition | Exactement les **18 codes** de la table §3. Aucune contradiction entre `language` et le suffixe `-fr`. |

### Confirmations

- Retail EN ↔ Retail FR : **168/168**, mêmes numéros, mêmes raretés. Le FR n'existe que pour la release `wnc-retail` : pas de Beta FR, ni de starters ou promos FR.
- Beta ↔ Retail (set principal, starters, box toppers) : mêmes cartes, mêmes numéros au préfixe `β` près, mêmes raretés. La Beta compte 4 impressions de plus : les **Iconic Secret `β168`–`β171`** (Johnny, Sasha, Panam, Judy), absentes du Retail.
- Numérotation du set principal continue : `001`–`167`, plus `005a`/`005b` ; la Beta va jusqu'à `β171`.
- **11 cartes n'ont aucune impression dans le set principal** : 10 cartes exclusives aux starters ou demo decks, plus Rebecca. Aucune n'a de version FR.
- Le texte anglais au niveau de la carte (`official_rules_text_en`) est identique à `official_rules_text` de toutes ses impressions EN.
- Le `canonical_base_name` est toujours la partie avant « — » de `canonical_name`, ou le nom entier s'il n'y a pas de sous-titre. Les noms FR (`localized_name`) contiennent « — » exactement quand le nom EN en contient.
- `finish` vaut toujours `null`. `keywords` est toujours vide. `rulings` est toujours vide.

### Écarts avec la spec et anomalies de la source

1. **Expiration des URL d'image (~5 min).** Télécharger les images « pendant le crawl » ne suffit pas : une page de 60 cartes contient environ 300 impressions, soit environ 300 s à 1 requête/s. Il faut des pages plus petites, avec les images téléchargées juste après chaque page, et/ou re-demander la page quand une URL a expiré.
2. **Les Prerelease Beta et Retail ne suivent pas la règle Beta/Retail** : pas de préfixe `β`, et un contenu différent. Sur 11 impressions de chaque côté, 2 coïncident (même carte, même numéro) ; 4 cartes sont présentes des deux côtés à des numéros différents (Royce `002`/`003`, Rogue `005`/`006`…) ; 5 sont propres à chaque tirage. Ce sont bien deux releases distinctes, sans correspondance numéro à numéro.
3. **Numéro mal formé** : *Over the Edge* porte le numéro `10` au lieu de `010` dans `embracingpowerretailstarterdeck` (et `β010` en Beta). C'est la seule exception au format `β?\d{3}[ab]?`.
4. **Textes FR divergents sur une même carte (7 cartes)** : les impressions Iconic omettent le texte de rappel (« (Payez le coût de cette Légende…) », « (Équipez à…) »). La divergence est réelle (texte imprimé) et non une erreur. Avec la règle actuelle (« la première impression de la langue »), le texte FR de la carte dépendrait de l'ordre de la source.
5. **Textes EN probablement inversés** sur *Overwatch — Panam's Gift*. Dans la Retail EN, le texte de rappel d'équipement est absent de `093` (Epic) mais présent sur l'Iconic `165`, ce qui est l'inverse de la Beta (`β093` avec, `β165` sans) et du FR (`093` avec, `165` sans). Ailleurs, aucun texte imprimé EN ne diffère du texte officiel : il n'y a pas d'errata dans les données.
6. **Nom FR divergent** : *Towerfall* s'appelle « Destruction de Tour » en `138` mais « Towerfall » en `167` (FR). C'est probablement une erreur de la source.
7. **Artistes différents entre Beta et Retail** sur 12 impressions (`112` et les Iconic `138`, `158`–`167`), par exemple `β159` « Dardo Studios » contre `159` « Atomhawk ». La Retail EN `158` a pour artiste « **TBD** » (« Pandart Studio » en Beta et en FR).
8. **Rebecca — Having a Moment** : `legality: "not-legal"`, uniquement en PRM01 (`005`, `007`). Elle n'a aucun texte de règles (`official_rules_text_en`, `printed_rules_text` et `official_rules_text` sont `null`), et c'est la seule carte hors du set principal et des starters.
9. **Trous de numérotation** dans les promos : Edgerunner Open S1 n'a pas `028`, `031` et `052` ; PRM01 commence à `005`. Rien ne permet de dire si ces cartes existent.
10. **Espaces** : des doubles espaces dans quelques textes de la source (ex. `2 €$,  {Spend}`, sur 10 textes).
11. L'ordre de la liste API n'est **pas alphabétique** : le tri du catalogue doit être fait par le pipeline (c'était déjà prévu).
12. Champs présents mais non décrits dans la spec : `external_id` (ex. `cb-v-streetkid`), `legalities` (`{ "standard": "legal" }`), `flavor_text` (toujours `null`), `rulings` (toujours vide).
