import type { CatalogSet, LanguageCode, Localized, ReleaseGroup } from "./model.ts";

// A Netdeck "edition" (set.code) mixes three axes: logical set, print run
// (release) and language. This explicit table splits them (spec §3).
// French names default to the English ones and are meant to be edited by hand.

export interface ReleaseDefinition {
  id: string;
  setId: string;
  name: Localized;
  group: ReleaseGroup;
  order: number;
  /** For a Beta release: the Retail release with the same cards and numbering (β prefix aside). */
  retailReleaseId?: string;
}

export interface EditionMapping {
  code: string;
  releaseId: string;
  /** Language expected for this edition; the printing's own language prevails. */
  language: LanguageCode;
}

export const UNKNOWN_SET_ID = "unknown";

export const SETS: CatalogSet[] = [
  { id: "wnc", name: sameInAllLanguages("Welcome to Night City"), order: 1 },
];

export const RELEASES: ReleaseDefinition[] = withOrder([
  // Display order (tabs and sub-filters of the app): Retail before Beta, as in the mockups.
  { id: "wnc-retail", setId: "wnc", name: sameInAllLanguages("Welcome to Night City — Retail"), group: "main" },
  { id: "wnc-beta", setId: "wnc", name: sameInAllLanguages("Welcome to Night City — Beta"), group: "main", retailReleaseId: "wnc-retail" },
  { id: "heist-starter-retail", setId: "wnc", name: sameInAllLanguages("The Heist — Retail Starter Deck"), group: "starter" },
  { id: "heist-starter-beta", setId: "wnc", name: sameInAllLanguages("The Heist — Beta Starter Deck"), group: "starter", retailReleaseId: "heist-starter-retail" },
  { id: "embracing-power-starter-retail", setId: "wnc", name: sameInAllLanguages("Embracing Power — Retail Starter Deck"), group: "starter" },
  { id: "embracing-power-starter-beta", setId: "wnc", name: sameInAllLanguages("Embracing Power — Beta Starter Deck"), group: "starter", retailReleaseId: "embracing-power-starter-retail" },
  { id: "merc-demo", setId: "wnc", name: sameInAllLanguages("Merc Demo Deck"), group: "demo" },
  { id: "arasaka-demo", setId: "wnc", name: sameInAllLanguages("Arasaka Demo Deck"), group: "demo" },
  // Pre-release Beta and Retail have different contents and numbering: no retailReleaseId.
  { id: "prerelease-retail", setId: "wnc", name: sameInAllLanguages("Pre-Release — Retail"), group: "promo" },
  { id: "prerelease-beta", setId: "wnc", name: sameInAllLanguages("Pre-Release — Beta"), group: "promo" },
  { id: "box-toppers-retail", setId: "wnc", name: sameInAllLanguages("Box Toppers — Retail"), group: "promo" },
  { id: "box-toppers-beta", setId: "wnc", name: sameInAllLanguages("Box Toppers — Beta"), group: "promo", retailReleaseId: "box-toppers-retail" },
  { id: "edgerunner-open-s1", setId: "wnc", name: sameInAllLanguages("Edgerunner Open S1"), group: "promo" },
  { id: "night-city-brawl-s1", setId: "wnc", name: sameInAllLanguages("Night City Brawl S1"), group: "promo" },
  { id: "night-city-showdown-s1", setId: "wnc", name: sameInAllLanguages("Night City Showdown S1"), group: "promo" },
  { id: "set1-promos", setId: "wnc", name: sameInAllLanguages("Set 1 Promos"), group: "promo" },
  { id: "judge-promos", setId: "wnc", name: sameInAllLanguages("Judge Promos"), group: "promo" },
]);

export const EDITIONS: EditionMapping[] = [
  { code: "welcometonightcitybeta", releaseId: "wnc-beta", language: "en" },
  { code: "welcometonightcityretail", releaseId: "wnc-retail", language: "en" },
  { code: "welcometonightcityretail-fr", releaseId: "wnc-retail", language: "fr" },
  { code: "theheistbetastarterdeck", releaseId: "heist-starter-beta", language: "en" },
  { code: "theheistretailstarterdeck", releaseId: "heist-starter-retail", language: "en" },
  { code: "embracingpowerbetastarterdeck", releaseId: "embracing-power-starter-beta", language: "en" },
  { code: "embracingpowerretailstarterdeck", releaseId: "embracing-power-starter-retail", language: "en" },
  { code: "mercdemodeck", releaseId: "merc-demo", language: "en" },
  { code: "arasakademodeck", releaseId: "arasaka-demo", language: "en" },
  { code: "boxtoppersbeta", releaseId: "box-toppers-beta", language: "en" },
  { code: "boxtoppersretail", releaseId: "box-toppers-retail", language: "en" },
  { code: "prereleasebeta", releaseId: "prerelease-beta", language: "en" },
  { code: "prereleaseretail", releaseId: "prerelease-retail", language: "en" },
  { code: "PRM01", releaseId: "set1-promos", language: "en" },
  { code: "judgepromos", releaseId: "judge-promos", language: "en" },
  { code: "edgerunneropens1", releaseId: "edgerunner-open-s1", language: "en" },
  { code: "nightcitybrawls1", releaseId: "night-city-brawl-s1", language: "en" },
  { code: "nightcityshowdowns1", releaseId: "night-city-showdown-s1", language: "en" },
];

const editionsByCode = new Map(EDITIONS.map((edition) => [edition.code, edition]));

export function findEdition(code: string): EditionMapping | undefined {
  return editionsByCode.get(code);
}

/** Release used for printings whose edition code is not in the table. */
export function unknownRelease(code: string): ReleaseDefinition {
  return {
    id: `unknown-${code}`,
    setId: UNKNOWN_SET_ID,
    name: sameInAllLanguages(code),
    group: "unknown",
    order: RELEASES.length + 1,
  };
}

export const UNKNOWN_SET: CatalogSet = { id: UNKNOWN_SET_ID, name: { en: "Unknown", fr: "Inconnu" }, order: SETS.length + 1 };

function sameInAllLanguages(name: string): Localized {
  return { en: name, fr: name };
}

function withOrder(releases: Omit<ReleaseDefinition, "order">[]): ReleaseDefinition[] {
  return releases.map((release, index) => ({ ...release, order: index + 1 }));
}
