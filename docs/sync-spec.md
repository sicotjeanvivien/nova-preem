# Spécification de la synchronisation Google Drive

Ce document décrit la synchronisation de la collection avec le Google Drive de l'utilisateur, première fonction après le MVP (`docs/app-spec.md` §11). Il complète `docs/app-spec.md`, dont il reprend les principes : pas de backend, domaine pur, stockage derrière des interfaces.

**Maquettes :** à ajouter au canevas « Nova Preem — MVP » avant l'implémentation (§8). Comme pour l'app, ce document fait foi pour les règles, le canevas pour l'apparence.

---

## 1. Objectif

Retrouver la même collection sur plusieurs appareils (téléphone, PC…), et la mettre à l'abri dans un espace qui appartient à l'utilisateur.

- La synchronisation est **facultative** : sans elle, l'app fonctionne exactement comme aujourd'hui.
- Les données vont **directement de l'appareil au Drive de l'utilisateur**. Le projet n'héberge rien et ne voit rien passer.
- **Hors-ligne d'abord** : chaque saisie est enregistrée localement tout de suite, comme aujourd'hui ; la synchronisation rattrape quand c'est possible. Elle ne bloque jamais une saisie.
- Une seule collection par compte Google.

Hors périmètre : partage de collection entre utilisateurs, historique des versions dans l'app (Drive garde ses propres révisions), autres fournisseurs (OneDrive, Dropbox…), que l'architecture doit cependant permettre (§6).

---

## 2. Le fichier dans Drive

- C'est le **fichier d'export** de `docs/app-spec.md` §4.3, sans changement de format (`nova-preem/collection`, `schemaVersion: 1`).
- Nom : `nova-preem-collection.json` (sans date : c'est toujours le même fichier), dans un dossier `Nova Preem` à la racine du Drive. Le fichier est **visible** : l'utilisateur peut le voir, le télécharger, le sauvegarder, et l'importer à la main dans l'app.
- Permission Google demandée : **`drive.file`**. L'app n'a accès qu'aux fichiers qu'elle a créés elle-même (quel que soit l'appareil), jamais au reste du Drive. Plus `openid email`, pour afficher le compte connecté.
- Le fichier et le dossier portent une propriété d'app (`appProperties: { novaPreem: "collection" }`, `"folder"` pour le dossier) : c'est elle qui permet de les retrouver, pas le nom.
- Le fichier est réécrit seulement si son contenu change (entrées ou réglages synchronisés), pour ne pas créer une révision Drive à chaque synchronisation.

### 2.1 Ce qui est synchronisé

- Toutes les entrées de la collection, y compris celles dont l'impression est inconnue du catalogue courant (`docs/app-spec.md` §4.3).
- Les réglages déjà présents dans le fichier d'export : tirage et langue de saisie, groupes comptés dans la complétion, seuil de doublon, langue des noms de cartes.
- **Restent propres à l'appareil** : langue de l'interface, téléchargement de toutes les images, taille des cartes de la Collection.

---

## 3. Fusion

### 3.1 Pourquoi pas la fusion de l'import

La fusion de l'import garde la plus grande quantité. En synchronisation, elle annulerait les retraits : une carte retirée sur le téléphone reviendrait depuis le PC qui en a encore 2. La synchronisation utilise donc une **fusion à trois points**.

### 3.2 Fusion à trois points

L'app garde la **base** : le contenu du fichier tel qu'il était après la dernière synchronisation réussie de cet appareil. Pour chaque impression :

```
résultat = base + (local − base) + (Drive − base)     puis ramené à 0 au minimum
```

Une quantité absente vaut 0. Conséquences :

| Cas | Base | Local | Drive | Résultat |
|---|---|---|---|---|
| Ajout sur un seul appareil | 1 | 3 | 1 | 3 |
| Retrait sur un seul appareil | 2 | 0 | 2 | 0 (entrée supprimée) |
| Ajouts des deux côtés (deux boosters hors-ligne) | 1 | 2 | 3 | 4 |
| Retraits des deux côtés | 2 | 1 | 0 | 0 (−1 ramené à 0) |
| Nouvelle impression des deux côtés | — | 1 | 1 | 2 |

Le dernier cas est voulu : la quantité est un compteur, deux saisies sont deux cartes. L'utilisateur corrige d'un « − » s'il a saisi deux fois la même carte.

- **Dates** : `firstAddedAt` = la plus ancienne des trois ; `lastAddedAt` = la plus récente des trois. Une entrée qui retombe à 0 est supprimée (`docs/app-spec.md` §4.1).
- **Réglages synchronisés** : même principe, réglage par réglage. Si un seul côté a changé depuis la base, sa valeur l'emporte ; si les deux ont changé, la valeur de l'appareil l'emporte (c'est celle que l'utilisateur a sous les yeux).
- La fusion est une **fonction pure du domaine** (`mergeCollections(base, local, remote)`), testée seule, avec chaque cas du tableau.

### 3.3 Première synchronisation d'un appareil

Il n'y a pas encore de base :

| Drive | Appareil | Action |
|---|---|---|
| pas de fichier | quelconque | créer le fichier à partir de l'appareil |
| fichier | collection vide | prendre le fichier |
| fichier | collection non vide | **demander** (ci-dessous) |

Le choix reprend le résumé de l'import (impressions ajoutées, modifiées, inconnues) et propose :
- **Fusionner** (par défaut) : la plus grande quantité de chaque impression, comme l'import ;
- **Garder Google Drive** : la collection de l'appareil est remplacée par celle du fichier ;
- **Garder cet appareil** : le fichier est remplacé par la collection de l'appareil.

### 3.4 Import pendant la synchronisation

Un import (`Remplacer` ou `Fusionner`) modifie la collection locale comme une série de saisies : la synchronisation suivante l'envoie dans Drive par la fusion à trois points. Les changements faits entre-temps sur un autre appareil sont conservés.

---

## 4. Connexion à Google

### 4.1 Sans backend

- Bibliothèque **Google Identity Services**, modèle « jeton » (`initTokenClient`), chargée seulement quand l'utilisateur active la synchronisation.
- Google donne un **jeton d'accès valable une heure**, sans jeton de renouvellement (il faudrait un serveur pour garder un secret). Renouveler le jeton ouvre une fenêtre Google, que les navigateurs n'autorisent qu'après un geste de l'utilisateur.
- Conséquence assumée : la synchronisation est **automatique tant que le jeton est valide**. Au-delà, elle se met **en pause** et l'app propose « Reprendre la synchronisation » ; un tap suffit (Google ne redemande ni le compte ni l'autorisation déjà donnée). Les saisies continuent d'être enregistrées localement pendant la pause.
- Le jeton et son heure d'expiration sont conservés localement (IndexedDB), pour qu'une relance de l'app dans l'heure reste synchronisée. Ils sont effacés à la déconnexion.
- L'identifiant client OAuth est public : il est fourni au build (`VITE_GOOGLE_CLIENT_ID`), comme l'URL du catalogue.

### 4.2 Déconnexion

« Se déconnecter de Google Drive » révoque le jeton et efface l'état de synchronisation de l'appareil (base, jeton, identifiant du fichier). La collection locale et le fichier dans Drive sont **conservés**.

---

## 5. Déroulement

### 5.1 Quand synchroniser

- après une saisie, un import ou un changement de réglage synchronisé : **5 secondes après la dernière modification** (une rafale de saisies donne une seule synchronisation) ;
- au lancement de l'app et quand elle revient au premier plan ;
- au retour du réseau ;
- sur « Synchroniser maintenant ».

Seulement si l'appareil est en ligne et le jeton valide ; sinon, la synchronisation attend. Une seule synchronisation à la fois.

### 5.2 Une synchronisation

1. Trouver le fichier : l'identifiant mémorisé, sinon une recherche par propriété d'app. Plusieurs fichiers trouvés : prendre le plus ancien et signaler les autres (§7).
2. Télécharger le fichier et sa version Drive ; le valider (Zod, `docs/app-spec.md` §4.3).
3. Fusionner base, local et Drive (§3).
4. Si le résultat diffère du fichier : vérifier que la version Drive n'a pas changé depuis l'étape 2, puis envoyer le fichier. Si elle a changé, recommencer à l'étape 2 (trois fois au plus). À vérifier lors de l'implémentation : si l'API Drive accepte une précondition d'écriture (`If-Match`), l'utiliser plutôt que cette vérification.
5. Si le résultat diffère de la collection locale : l'écrire localement, en une transaction.
6. Le résultat devient la nouvelle base.

L'interface ne se fige jamais pendant une synchronisation. Si une saisie arrive pendant les étapes 2 à 5, elle est conservée et déclenche une nouvelle synchronisation.

### 5.3 États

| État | Signification |
|---|---|
| Désactivée | jamais connecté, ou déconnecté |
| À jour | dernière synchronisation réussie, rien en attente |
| En attente | modifications locales pas encore envoyées (hors-ligne, ou délai de 5 s) |
| En cours | synchronisation en train de se faire |
| En pause | jeton expiré : « Reprendre la synchronisation » |
| Erreur | voir §7 ; l'app réessaie à la prochaine occasion |

« Modifications en attente » se déduit de la comparaison entre la collection locale et la base : pas de drapeau à maintenir.

---

## 6. Architecture

Mêmes règles que `docs/app-spec.md` §9.1.

- **Domaine** (`app/src/domain/`, pur) : la fusion à trois points, l'état de synchronisation et ses transitions, l'interface `SyncStore` (base, identifiant du fichier, version, jeton, dernière synchronisation), et l'interface **`RemoteFileProvider`** :
  ```ts
  interface RemoteFileProvider {
    /** The collection file, if it exists. */
    find(): Promise<RemoteFileRef | undefined>;
    download(ref: RemoteFileRef): Promise<{ text: string; version: string }>;
    create(text: string): Promise<RemoteFileRef>;
    /** Fails with a "changed" error if the remote version is no longer `expectedVersion`. */
    update(ref: RemoteFileRef, text: string, expectedVersion: string): Promise<RemoteFileRef>;
  }
  ```
  Un autre fournisseur (OneDrive…) n'aurait qu'à implémenter cette interface.
- **Plateforme** (`app/src/platform/`) : l'authentification Google (Identity Services) et l'implémentation Google Drive de `RemoteFileProvider` (API REST v3, `fetch`, sans SDK Google).
- **Stockage** (`app/src/storage/`) : `SyncStore` dans Dexie, nouvelle table `sync` (version 2 de la base, migration sans perte).
- **Interface** : un contexte React qui déclenche les synchronisations (§5.1) et expose l'état (§5.3).

---

## 7. Erreurs

| Cas | Comportement |
|---|---|
| Fichier mémorisé introuvable ou dans la corbeille | rechercher par propriété d'app ; sinon, recréer le fichier depuis l'appareil et le signaler (« Le fichier de synchronisation a été recréé ») |
| Plusieurs fichiers trouvés | utiliser le plus ancien ; signaler dans Réglages qu'il y en a d'autres, sans les toucher |
| Fichier invalide ou d'un format inconnu (modifié à la main…) | ne rien écrire, ni localement ni dans Drive ; état Erreur avec le message de l'import |
| Autorisation refusée ou retirée par l'utilisateur | état Désactivée, message « Google Drive n'est plus autorisé » |
| Drive plein | état Erreur, message dédié ; les saisies restent locales |
| Réseau ou serveur (5xx, 429) | état En attente ; nouvel essai à la prochaine occasion (§5.1), avec un délai croissant |

Aucune erreur de synchronisation ne supprime de données locales.

---

## 8. Interface (à maquetter)

Écrans et éléments à ajouter au canevas avant l'implémentation, en mobile et en bureau :

1. **Réglages → Données, synchronisation désactivée** : la ligne « Synchronisation Google Drive — Bientôt » devient un bouton « Synchroniser avec Google Drive », avec une phrase d'explication (le fichier est dans ton Drive, le projet n'y a pas accès, la synchronisation est facultative).
2. **Réglages → Données, synchronisation active** : compte connecté, état (§5.3) et heure de la dernière synchronisation, « Synchroniser maintenant », lien « Voir le fichier dans Drive », « Se déconnecter ». Les avertissements du §7 s'affichent ici.
3. **Choix de la première synchronisation** (§3.3) : résumé et trois choix, dans la forme du dialogue d'import.
4. **Indicateur d'état** visible hors de Réglages, discret : barre latérale sur bureau (à côté de « Hors-ligne prêt »), et un équivalent sur mobile. En pause : un bandeau ou un bouton « Reprendre la synchronisation », dans l'esprit du bandeau hors-ligne.
5. Les messages d'erreur du §7.

Tous les textes en français et en anglais.

---

## 9. Mise en place côté Google

À faire par le propriétaire du projet, une fois (détail à reporter dans `docs/deploy.md` à l'étape 2) :

- Un projet Google Cloud, avec l'**API Google Drive** activée.
- Un écran de consentement OAuth (type « Externe », nom « Nova Preem », adresse de contact), avec les permissions `drive.file`, `openid` et `email`, qui ne sont pas « sensibles » au sens de Google.
- Un identifiant client OAuth de type « Application Web », origines autorisées : `https://nova-preem.pages.dev`, `http://localhost:5173`, `http://localhost:4173`.
- La variable GitHub `GOOGLE_CLIENT_ID`, passée au build comme `VITE_GOOGLE_CLIENT_ID`.

**Avant l'ouverture au public** : en mode « Test », l'écran de consentement est limité à 100 comptes déclarés à la main. Passer en production demande une page d'accueil et une **politique de confidentialité** publiques, sur un **domaine vérifié appartenant au projet** (un sous-domaine `pages.dev` ne convient pas). Ce sera à prévoir avec le domaine propre de `docs/app-spec.md` §9.2.

---

## 10. Étapes

Même règle que `docs/app-spec.md` §10 : une étape à la fois, chacune se termine par une app qui fonctionne.

1. **Fusion et état** : `mergeCollections`, fusion des réglages, choix de la première synchronisation, transitions d'état, `SyncStore` et migration Dexie. Sans interface.
   *Critère* : tests unitaires couvrant chaque ligne des tableaux du §3, dont le retrait d'un seul côté et les ajouts des deux côtés.
2. **Connexion et synchronisation manuelle** : authentification Google, fournisseur Drive, Réglages (écrans 1 et 2 du §8), « Synchroniser maintenant », première synchronisation (écran 3), déconnexion, mise en place du §9.
   *Critère* : sur deux navigateurs connectés au même compte, une carte ajoutée sur l'un apparaît sur l'autre après « Synchroniser maintenant », et une carte retirée disparaît.
3. **Synchronisation automatique** : déclencheurs du §5.1, indicateur d'état, pause et reprise, erreurs du §7, textes anglais.
   *Critère* : saisir hors-ligne sur le téléphone et sur le PC, remettre le réseau : les deux appareils convergent vers la même collection, sans perte ni doublon d'action.
