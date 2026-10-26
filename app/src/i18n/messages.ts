import type { InterfaceLanguage } from "../domain/settings.ts";

// Every interface string (docs/app-spec.md §8). French is the reference;
// English must define exactly the same keys (checked by the type).

type Params = Record<string, string | number>;
export type Message = string | ((params: Params, plural: (n: number) => Intl.LDMLPluralRule) => string);

const fr = {
  "app.name": "NOVA PREEM",
  "nav.label": "Navigation principale",
  "nav.sets": "Sets",
  "nav.collection": "Collection",
  "nav.search": "Recherche",
  "nav.stats": "Stats",
  "nav.settings": "Réglages",
  "status.offlineReady": "Hors-ligne prêt",
  "status.offline": "Hors-ligne",
  "legal.fanMade": "Fan-made, non officiel",
  "legal.footer": "Fan-made, non officiel. Données : base officielle des cartes.",
  "legal.settings": "Outil de fan, non officiel. Les noms, textes et images des cartes appartiennent à leurs ayants droit.",
  "language.short.en": "VO",
  "language.short.fr": "VF",
  "language.and": ({ a, b }) => `${a} et ${b}`,
  "sets.title": "Sets",
  "sets.eyebrow": ({ order }) => `Set ${order}`,
  "sets.releases": ({ count }, plural) => `${count} ${plural(Number(count)) === "one" ? "tirage" : "tirages"}`,
  "sets.cards": ({ count }, plural) => `${count} ${plural(Number(count)) === "one" ? "carte" : "cartes"}`,
  "collection.title": "Collection",
  "search.title": "Recherche",
  "stats.title": "Stats",
  "settings.title": "Réglages",
  "firstLaunch.downloading": "Téléchargement du catalogue",
  "firstLaunch.explanation": "Cartes, impressions et textes VO et VF. Ensuite, l'app fonctionne sans réseau.",
  "firstLaunch.images": "Les images se téléchargent au fil de la navigation. Option dans les réglages : tout télécharger d'un coup en Wi-Fi.",
  "firstLaunch.error.network": "Impossible de télécharger le catalogue. Vérifiez votre connexion, puis réessayez.",
  "firstLaunch.error.invalid": "Le catalogue reçu est incomplet ou invalide. Réessayez dans un moment.",
  "firstLaunch.retry": "Réessayer",
} satisfies Record<string, Message>;

export type MessageKey = keyof typeof fr;

const en: Record<MessageKey, Message> = {
  "app.name": "NOVA PREEM",
  "nav.label": "Main navigation",
  "nav.sets": "Sets",
  "nav.collection": "Collection",
  "nav.search": "Search",
  "nav.stats": "Stats",
  "nav.settings": "Settings",
  "status.offlineReady": "Offline ready",
  "status.offline": "Offline",
  "legal.fanMade": "Fan-made, unofficial",
  "legal.footer": "Fan-made, unofficial. Data: official card database.",
  "legal.settings": "Fan tool, unofficial. Card names, texts and images belong to their respective owners.",
  "language.short.en": "EN",
  "language.short.fr": "FR",
  "language.and": ({ a, b }) => `${a} and ${b}`,
  "sets.title": "Sets",
  "sets.eyebrow": ({ order }) => `Set ${order}`,
  "sets.releases": ({ count }, plural) => `${count} ${plural(Number(count)) === "one" ? "release" : "releases"}`,
  "sets.cards": ({ count }, plural) => `${count} ${plural(Number(count)) === "one" ? "card" : "cards"}`,
  "collection.title": "Collection",
  "search.title": "Search",
  "stats.title": "Stats",
  "settings.title": "Settings",
  "firstLaunch.downloading": "Downloading the catalog",
  "firstLaunch.explanation": "Cards, printings and texts in English and French. Then the app works without a network.",
  "firstLaunch.images": "Images are downloaded as you browse. Option in the settings: download them all at once on Wi-Fi.",
  "firstLaunch.error.network": "The catalog could not be downloaded. Check your connection, then try again.",
  "firstLaunch.error.invalid": "The catalog received is incomplete or invalid. Try again in a moment.",
  "firstLaunch.retry": "Try again",
};

export const MESSAGES: Record<InterfaceLanguage, Record<MessageKey, Message>> = { fr, en };
