# Pages légales : spécification

Quatre pages publiques dans l'app : À propos, Confidentialité, Mentions légales, CGU. Elles sont nécessaires à l'ouverture au public, à la vérification de l'écran de consentement Google (`docs/sync-spec.md` §9) et, plus tard, à la fiche Play Store.

Les textes ont été rédigés hors avocat, d'après le fonctionnement réel de l'app au 30/10/2026. **Toute évolution qui change les données traitées** (prix automatiques, statistiques, nouveau service tiers, compte…) **doit mettre à jour la politique de confidentialité avant d'être livrée.**

---

## 1. Pages et textes

| Page | Route | Texte FR | Texte EN |
|---|---|---|---|
| À propos | `/a-propos` | `docs/legal/fr/about.md` | `docs/legal/en/about.md` |
| Confidentialité | `/confidentialite` | `docs/legal/fr/privacy.md` | `docs/legal/en/privacy.md` |
| Mentions légales | `/mentions-legales` | `docs/legal/fr/legal-notice.md` | `docs/legal/en/legal-notice.md` |
| CGU | `/cgu` | `docs/legal/fr/terms.md` | `docs/legal/en/terms.md` |

- Les fichiers de `docs/legal/` sont **la source** : l'app les affiche tels quels (pas de réécriture dans le code). Les déplacer dans `app/` si c'est plus simple pour le build, mais garder un seul exemplaire de chaque texte.
- Deux marqueurs à remplacer au build, définis à **un seul endroit** (configuration de l'app, variables `VITE_SITE_DOMAIN` et `VITE_CONTACT_EMAIL` par exemple) :
  - `{{domain}}` : le domaine public. **Pas encore choisi** : en attendant, `nova-preem.pages.dev`.
  - `{{contactEmail}}` : l'adresse de contact, affichée comme lien `mailto:`. **À fournir par le propriétaire** ; le build échoue clairement si elle manque en production.
- La langue suit la langue de l'interface. Les liens internes des textes (`/confidentialite`…) restent les mêmes dans les deux langues.
- Les textes français font foi (dit à la fin des CGU anglaises).

## 2. Accès

- **Réglages** : nouvelle section « À propos », la dernière, mobile et bureau, avec quatre lignes (À propos de Nova Preem, Confidentialité, Mentions légales, CGU) et la version de l'app. La mention « fan-made » actuelle reste en dessous.
- **Barre latérale (bureau)** : sous « Fan-made, non officiel », une ligne de liens discrets « À propos · Confidentialité · Mentions légales · CGU ».
- **Premier lancement** : un lien « Confidentialité » et « Mentions légales » en bas de l'écran (les pages doivent s'ouvrir **avant** que le catalogue soit téléchargé).
- **Synchronisation désactivée** (carte Synchronisation de Réglages) : un lien « En savoir plus » vers la section Google Drive de la politique de confidentialité (ancre `#google-drive`).
- Pour l'écran de consentement Google : page d'accueil `https://{{domain}}/a-propos`, politique de confidentialité `https://{{domain}}/confidentialite`, conditions `https://{{domain}}/cgu`.

## 3. Affichage

- Apparence : maquettes `Legal` (mobile) et `WebLegal` (bureau) du canevas, rangée « Pages légales ». Mobile : en-tête avec retour (vers l'écran d'origine, Réglages par défaut), sans barre du bas. Bureau : barre latérale normale, texte en colonne de 720 px au plus.
- Bas de page : liens vers les trois autres pages.
- Markdown simple (titres, paragraphes, listes, gras, liens, code en ligne). Liens externes avec `rel="noopener"` et ouverture dans un nouvel onglet ; liens internes par le routeur.
- Ancres sur les titres de niveau 2, pour les liens directs. Un titre peut fixer son ancre avec `## Titre {#id}` (la section Google Drive de la politique porte `{#google-drive}`) ; le `{#id}` n'est pas affiché.

## 4. Contraintes techniques

- **Hors-ligne** : les textes font partie du bundle (précachés), aucun chargement réseau.
- **Lisibles sans JavaScript** : les vérificateurs de Google et les moteurs de recherche lisent le HTML brut. Générer au build un HTML statique par route (`/a-propos/index.html`…, version française, avec le style de l'app), que l'app remplace au chargement. Vérifier que Cloudflare Pages sert bien ces fichiers avant le repli SPA, et que le service worker ne les masque pas.
- La conversion Markdown → HTML se fait **au build**, sans bibliothèque à l'exécution. Une petite dépendance de build est acceptable.
- `<title>` et `meta description` propres à chaque page.

## 5. Licence

- Le code est sous licence MIT (`LICENSE` à la racine), titulaire AWSD.
- La licence ne couvre **pas** les données et images des cartes (`catalog/dist/`, images servies par l'app), qui appartiennent à leurs ayants droit. C'est écrit dans `LICENSE`.

## 6. Critère

Les quatre pages s'ouvrent en FR et en EN depuis Réglages (mobile et bureau), depuis la barre latérale et depuis le premier lancement, hors-ligne compris ; `curl https://{{domain}}/confidentialite` renvoie le texte complet en HTML ; aucun marqueur `{{…}}` ne reste dans le build.
