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
- **[à vérifier]** la valeur maximale acceptée par `limit` (si `limit=200` fonctionne, une seule requête suffit). Rester à 60 si le doute persiste.
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
| `color` | `"Red"` | Observé : `Red`, `Yellow`. **[à vérifier]** la liste complète. |
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
| `source_image_url` | même URL **sans signature** | **[à vérifier]** : accessible ou non. |

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
- **[à vérifier]** le rattachement de toutes les releases au set `wnc` : à confirmer pour les promos d'organized play (EO, Brawl, Showdown). Le set 2 (*Edgerunners: Burn Bright*, printemps 2027) aura son propre set.

### Faits observés sur la numérotation

- **Chaque release a sa propre numérotation.** Les starters sont numérotés dans le deck (`001`, `002`…), les promos dans leur série. Exemple : Chrome Fang = `008` en Retail, `002` dans le starter Embracing Power.
- **Beta et Retail ont la même numérotation**, au préfixe `β` près (`β003` ↔ `003`), y compris pour les starters et les Box Toppers.
- **Retail EN et Retail FR ont exactement les mêmes numéros** : vérifié sur les 60 cartes (67 impressions de chaque côté).
- Certaines impressions n'existent que dans **un seul tirage** : ex. l'Iconic `β168` de Johnny Silverhand existe en Beta, pas en Retail.
- Certaines cartes **n'existent que dans un starter** (ex. *Yorinobu Arasaka — Embracing Destruction*), sans impression dans le set principal.
- Les suffixes `a`/`b` (`005a`, `005b`) n'ont été vus que sur *V — Streetkid*. **[à vérifier]** leur sens (deux arts ? recto/verso ?). Ils font partie du numéro et ne doivent pas être retirés.
- La clé `(card.id, set.code, collector_number, language)` est unique sur l'échantillon. **[à vérifier]** sur l'ensemble.

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
  generatedAt: string;          // ISO 8601
  source: { name: "netdeck"; fetchedAt: string };
  languages: LanguageCode[];    // ["en", "fr"]
  sets: Set[];
  releases: Release[];
  rarities: Rarity[];
  cards: Card[];
  printings: Printing[];
}

type LanguageCode = "en" | "fr" | string;
type ReleaseGroup = "main" | "starter" | "demo" | "promo";

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
  name: Record<LanguageCode, string>;      // nom complet par langue ("Johnny Silverhand — Rock'n'Rebelle")
  baseName: Record<LanguageCode, string>;  // nom sans sous-titre, si disponible
  rulesText: Record<LanguageCode, string>; // texte par langue
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
  image: { path: string; width?: number; height?: number } | null; // chemin relatif dans le stockage d'images
  sourceCode: string;           // set.code Netdeck d'origine, pour traçabilité
}
```

Règles :
- Tableaux **triés de façon déterministe** (sets, releases et raretés par `order` ; cartes par nom anglais ; impressions par release, `sortKey`, langue) et JSON stable : deux exécutions sur les mêmes données doivent produire un fichier **identique** (diff git lisible).
- Pas d'URL signée dans le catalogue.
- `name` / `rulesText` d'une carte : `en` depuis `canonical_name` / `official_rules_text_en` ; les autres langues depuis la première impression de cette langue (`localized_name`, `printed_rules_text`). Si deux impressions d'une même langue ont des textes différents, le signaler.
- Les noms de sets et de releases en français sont saisis à la main dans la table des éditions (par défaut identiques à l'anglais).

### manifest.json

```json
{ "schemaVersion": 1, "version": "2026-10-26.1", "hash": "sha256:…", "generatedAt": "…", "counts": { "cards": 151, "printings": 0 } }
```

L'app compare `version`/`hash` au démarrage pour savoir si elle doit retélécharger le catalogue.

### report.json

Liste des anomalies, sans faire échouer le pipeline : codes d'édition inconnus, raretés inconnues, impressions VO/VF sans équivalent, contradictions de langue, textes divergents, clés dupliquées, images manquantes. Le pipeline affiche un résumé en fin d'exécution.

Le pipeline **échoue** (code de sortie non nul) seulement si : la validation Zod échoue, `total` ne correspond pas au nombre de cartes reçues, ou des identifiants (carte ou impression) sont dupliqués.

---

## 6. Images

- Les URL d'image sont **signées et expirent** : le catalogue ne doit jamais les contenir.
- Phase 1 (maintenant) : télécharger les images dans `catalog/dist/images/{printingId}.webp` pendant le crawl, avec les mêmes règles de politesse (espacement, cache : ne pas retélécharger une image déjà présente). Dossier ignoré par git.
- Commencer par **tester `source_image_url`** (sans signature). S'il répond, l'utiliser ; sinon utiliser `image_url` immédiatement après l'avoir reçue.
- Générer aussi une miniature (ex. 256 px de large) pour les grilles : `images/thumbs/{printingId}.webp` (sharp).
- Phase 2 (plus tard) : publication des images sur un stockage objet (Cloudflare R2 ou équivalent). Le champ `image.path` reste relatif pour que seule la base d'URL change.

---

## 7. Organisation du code

```
catalog/
  package.json          scripts : "crawl", "build", "test"
  src/
    sources/netdeck.ts  adaptateur : pagination, cache, politesse, validation Zod
    editions.ts         table set.code → set / release / langue / groupe
    rarities.ts         table des raretés
    normalize.ts        Card/Printing source → modèle du catalogue, variantKey, rattachement VO/VF
    images.ts           téléchargement et miniatures
    report.ts           collecte des anomalies
    build.ts            orchestration, tri, écriture de catalog.json / manifest.json / report.json
  test/
    fixtures/           réponses réelles (tronquées) de l'API
  .cache/               (gitignore) réponses brutes
  dist/                 (gitignore pour images/, catalog.json commité à terme pour revue)
```

Commandes attendues :
- `pnpm crawl` : télécharge les données (avec cache) et les images ;
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
