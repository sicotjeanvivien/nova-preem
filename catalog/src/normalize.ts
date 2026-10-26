import { EDITIONS, RELEASES, SETS, UNKNOWN_SET, findEdition, unknownRelease, type ReleaseDefinition } from "./editions.ts";
import type { Card, CatalogSet, LanguageCode, Localized, Printing, Rarity, Release } from "./model.ts";
import { RARITIES, findRarity, unknownRarity } from "./rarities.ts";
import type { Report } from "./report.ts";
import type { SourceCard, SourcePrinting, SourceSnapshot } from "./sources/types.ts";

export const PRIMARY_LANGUAGES: LanguageCode[] = ["en", "fr"];
export const SUBTITLE_SEPARATOR = " — ";
const BETA_PREFIX = "β";
const COLLECTOR_NUMBER_FORMAT = /^β?\d{3}[a-z]?$/;
const KNOWN_TYPES = new Set(["legend", "unit", "gear", "program"]);
const KNOWN_COLORS = new Set(["red", "yellow", "blue", "green"]);
const KNOWN_LEGALITIES = new Set(["legal", "not-legal"]);
const PLACEHOLDER_ARTISTS = /^(tbd|tba|unknown)$/i;

export interface NormalizedCatalog {
  languages: LanguageCode[];
  sets: CatalogSet[];
  releases: Release[];
  rarities: Rarity[];
  cards: Card[];
  printings: Printing[];
}

/** A catalog printing with the source data and lookups needed by the checks. */
interface Entry {
  printing: Printing;
  source: SourcePrinting;
  card: SourceCard;
  release: ReleaseDefinition;
  rarity: Rarity;
  /** Collector number without the β prefix. */
  number: string;
}

/**
 * Turns the source snapshot into the catalog model (spec §3–§5). Arrays are
 * returned in their final, deterministic order. Throws only on duplicate
 * identifiers; every other problem is recorded in the report.
 */
export function normalize(snapshot: SourceSnapshot, report: Report): NormalizedCatalog {
  assertUniqueIds(snapshot.cards);

  const releases = new Map<string, ReleaseDefinition>(RELEASES.map((release) => [release.id, release]));
  const rarities = new Map<string, Rarity>(RARITIES.map((rarity) => [rarity.id, rarity]));
  const unknownCodes = new Map<string, number>();
  const unknownRarities = new Map<string, number>();

  const entries: Entry[] = [];
  for (const card of snapshot.cards) {
    for (const source of card.printings) {
      const edition = findEdition(source.editionCode);
      let release: ReleaseDefinition;
      if (edition) {
        release = releases.get(edition.releaseId)!;
        if (edition.language !== source.language) {
          report.warn(
            "language-mismatch",
            `${describe(card, source)} : langue « ${source.language} » alors que l'édition est en « ${edition.language} »`,
            printingContext(card, source),
          );
        }
      } else {
        release = unknownRelease(source.editionCode);
        releases.set(release.id, release);
        unknownCodes.set(source.editionCode, (unknownCodes.get(source.editionCode) ?? 0) + 1);
      }

      let rarity = findRarity(source.rarity);
      if (!rarity) {
        rarity = unknownRarity(source.rarity);
        rarities.set(rarity.id, rarity);
        unknownRarities.set(source.rarity, (unknownRarities.get(source.rarity) ?? 0) + 1);
      }

      if (!COLLECTOR_NUMBER_FORMAT.test(source.collectorNumber)) {
        report.warn(
          "malformed-collector-number",
          `${describe(card, source)} : numéro « ${source.collectorNumber} » hors du format attendu (β?000, suffixe a/b éventuel)`,
          printingContext(card, source),
        );
      }
      if (source.artist !== null && PLACEHOLDER_ARTISTS.test(source.artist)) {
        report.warn("placeholder-artist", `${describe(card, source)} : artiste « ${source.artist} »`, printingContext(card, source));
      }

      const number = stripBetaPrefix(source.collectorNumber);
      entries.push({
        card,
        source,
        release,
        rarity,
        number,
        printing: {
          id: source.id,
          cardId: card.id,
          releaseId: release.id,
          variantKey: `${release.id}#${number}`,
          language: source.language,
          collectorNumber: source.collectorNumber,
          sortKey: sortKey(number),
          rarityId: rarity.id,
          artist: source.artist,
          finish: source.finish,
          image: null,
          sourceCode: source.editionCode,
        },
      });
    }
  }

  for (const [code, count] of unknownCodes) {
    report.warn("unknown-edition", `Code d'édition inconnu « ${code} » (${count} impressions) : à ajouter dans editions.ts`, { sourceCode: code, count });
  }
  for (const [name, count] of unknownRarities) {
    report.warn("unknown-rarity", `Rareté inconnue « ${name} » (${count} impressions) : à ajouter dans rarities.ts`, { rarity: name, count });
  }
  const seenCodes = new Set(entries.map((entry) => entry.source.editionCode));
  for (const edition of EDITIONS.filter((e) => !seenCodes.has(e.code))) {
    report.info("unused-edition", `Le code d'édition « ${edition.code} » de la table n'apparaît pas dans la source`, { sourceCode: edition.code });
  }

  const languages = [...new Set([...PRIMARY_LANGUAGES, ...entries.map((e) => e.printing.language).sort()])];
  entries.sort(compareEntries(languages));

  const catalogReleases = buildReleases(entries, languages);
  checkDuplicateKeys(entries, report);
  checkVariants(entries, catalogReleases, report);
  checkBetaRetailCounterparts(entries, report);
  checkNumberingGaps(entries, report);

  const entriesByCard = groupBy(entries, (entry) => entry.card.id);
  const cards = snapshot.cards.map((card) => buildCard(card, entriesByCard.get(card.id) ?? [], report));
  addPrintedRulesTexts(entries, new Map(cards.map((card) => [card.id, card])));
  const collator = new Intl.Collator("en");
  cards.sort((a, b) => collator.compare(a.name.en!, b.name.en!) || compareStrings(a.id, b.id));

  const usedSetIds = new Set(catalogReleases.map((release) => release.setId));
  return {
    languages,
    sets: [...SETS, UNKNOWN_SET].filter((set) => usedSetIds.has(set.id)),
    releases: catalogReleases,
    rarities: [...rarities.values()].sort((a, b) => a.order - b.order || compareStrings(a.id, b.id)),
    cards,
    printings: entries.map((entry) => entry.printing),
  };
}

/** Collector number without the Beta prefix: "β003" → "003". */
export function stripBetaPrefix(collectorNumber: string): string {
  return collectorNumber.startsWith(BETA_PREFIX) ? collectorNumber.slice(BETA_PREFIX.length) : collectorNumber;
}

/** Sortable key for a collector number (without β): "3" / "003" → "0003", "005a" → "0005a". Unparsable numbers sort last. */
export function sortKey(number: string): string {
  const match = /^(\d+)([a-z]*)$/.exec(number);
  return match ? `${match[1]!.padStart(4, "0")}${match[2]}` : `~${number}`;
}

function assertUniqueIds(cards: SourceCard[]): void {
  const duplicates = (ids: string[]) => [...groupBy(ids, (id) => id)].filter(([, list]) => list.length > 1).map(([id]) => id);
  const cardDuplicates = duplicates(cards.map((card) => card.id));
  const printingDuplicates = duplicates(cards.flatMap((card) => card.printings.map((printing) => printing.id)));
  if (cardDuplicates.length > 0 || printingDuplicates.length > 0) {
    throw new Error(
      `Duplicate identifiers in the source: cards [${cardDuplicates.join(", ")}], printings [${printingDuplicates.join(", ")}]`,
    );
  }
}

function buildReleases(entries: Entry[], languages: LanguageCode[]): Release[] {
  const editionOrder = new Map(EDITIONS.map((edition, index) => [edition.code, index]));
  const byRelease = groupBy(entries, (entry) => entry.release.id);
  return [...byRelease.values()].map((list) => {
    const { id, setId, name, group, order } = list[0]!.release;
    const releaseLanguages = new Set(list.map((entry) => entry.printing.language));
    const sourceCodes = [...new Set(list.map((entry) => entry.source.editionCode))].sort(
      (a, b) => (editionOrder.get(a) ?? Infinity) - (editionOrder.get(b) ?? Infinity) || compareStrings(a, b),
    );
    return { id, setId, name, group, languages: languages.filter((language) => releaseLanguages.has(language)), sourceCodes, order };
  });
}

function checkDuplicateKeys(entries: Entry[], report: Report): void {
  const byKey = groupBy(entries, ({ card, source }) => [card.id, source.editionCode, source.collectorNumber, source.language].join("|"));
  for (const list of byKey.values()) {
    if (list.length < 2) continue;
    const { card, source } = list[0]!;
    report.warn("duplicate-printing-key", `${describe(card, source)} : ${list.length} impressions pour la même carte, édition, numéro et langue`, {
      ...printingContext(card, source),
      printingIds: list.map((entry) => entry.printing.id),
    });
  }
}

/** Checks that the language versions of a printing (same variantKey) agree, and that none is missing. */
function checkVariants(entries: Entry[], releases: Release[], report: Report): void {
  const releaseLanguages = new Map(releases.map((release) => [release.id, release.languages]));
  for (const [variantKey, list] of groupBy(entries, (entry) => entry.printing.variantKey)) {
    const cardIds = [...new Set(list.map((entry) => entry.card.id))];
    if (cardIds.length > 1) {
      report.warn("variant-card-conflict", `${variantKey} : plusieurs cartes portent le même numéro (${list.map((e) => e.card.name).join(", ")})`, {
        variantKey,
        cardIds,
      });
      continue;
    }
    const { card } = list[0]!;
    const present = new Set(list.map((entry) => entry.printing.language));
    for (const language of releaseLanguages.get(list[0]!.release.id) ?? []) {
      if (present.has(language)) continue;
      report.warn("missing-translation", `${card.name} ${variantKey} : pas d'impression en « ${language} »`, {
        cardId: card.id,
        variantKey,
        language,
        printingIds: list.map((entry) => entry.printing.id),
      });
    }
    for (const field of ["rarityId", "artist"] as const) {
      const values = new Set(list.map((entry) => entry.printing[field]));
      if (values.size < 2) continue;
      report.warn(
        "variant-mismatch",
        `${card.name} ${variantKey} : ${field} diffère selon la langue (${list.map((e) => `${e.printing.language} « ${e.printing[field]} »`).join(", ")})`,
        { cardId: card.id, variantKey, field, printingIds: list.map((entry) => entry.printing.id) },
      );
    }
  }
}

/** A Beta release and its Retail release share cards and numbering (β prefix aside): compare them printing by printing. */
function checkBetaRetailCounterparts(entries: Entry[], report: Report): void {
  const byRelease = groupBy(entries, (entry) => entry.release.id);
  const key = (entry: Entry) => `${entry.card.id}#${entry.number}#${entry.printing.language}`;
  for (const beta of RELEASES) {
    if (!beta.retailReleaseId) continue;
    const betaEntries = byRelease.get(beta.id) ?? [];
    const retailEntries = byRelease.get(beta.retailReleaseId) ?? [];
    const sharedLanguages = new Set(betaEntries.map((e) => e.printing.language).filter((l) => retailEntries.some((e) => e.printing.language === l)));
    const betaByKey = new Map(betaEntries.map((entry) => [key(entry), entry]));
    const retailByKey = new Map(retailEntries.filter((e) => sharedLanguages.has(e.printing.language)).map((entry) => [key(entry), entry]));

    for (const [k, betaEntry] of betaByKey) {
      const retailEntry = retailByKey.get(k);
      const { card, source } = betaEntry;
      if (!retailEntry) {
        report.info("missing-retail-counterpart", `${describe(card, source)} : pas d'équivalent dans ${beta.retailReleaseId}`, printingContext(card, source));
        continue;
      }
      for (const field of ["rarityId", "artist"] as const) {
        if (betaEntry.printing[field] === retailEntry.printing[field]) continue;
        report.warn(
          "counterpart-mismatch",
          `${card.name} ${source.collectorNumber} : ${field} « ${betaEntry.printing[field]} » en Beta, « ${retailEntry.printing[field]} » en Retail`,
          { cardId: card.id, field, printingIds: [betaEntry.printing.id, retailEntry.printing.id] },
        );
      }
    }
    for (const [k, { card, source }] of retailByKey) {
      if (betaByKey.has(k)) continue;
      report.info("missing-beta-counterpart", `${describe(card, source)} : pas d'équivalent dans ${beta.id}`, printingContext(card, source));
    }
  }
}

function checkNumberingGaps(entries: Entry[], report: Report): void {
  for (const [releaseId, list] of groupBy(entries, (entry) => entry.release.id)) {
    const numbers = new Set(list.map((entry) => parseInt(entry.number, 10)).filter(Number.isFinite));
    const max = Math.max(...numbers);
    const missing: string[] = [];
    for (let n = 1; n <= max; n++) if (!numbers.has(n)) missing.push(String(n).padStart(3, "0"));
    if (missing.length === 0) continue;
    report.info("numbering-gap", `${releaseId} : numéros absents entre 001 et ${String(max).padStart(3, "0")} : ${missing.join(", ")}`, {
      releaseId,
      missing,
    });
  }
}

function buildCard(card: SourceCard, entries: Entry[], report: Report): Card {
  const context = { cardId: card.id, card: card.name };
  if (entries.length === 0) report.warn("card-without-printings", `${card.name} : aucune impression`, context);

  const type = card.type.toLowerCase();
  if (!KNOWN_TYPES.has(type)) report.warn("unknown-card-type", `${card.name} : type « ${card.type} » inconnu`, context);
  const color = card.color?.toLowerCase() ?? null;
  if (color !== null && !KNOWN_COLORS.has(color)) report.warn("unknown-color", `${card.name} : couleur « ${card.color} » inconnue`, context);
  if (!KNOWN_LEGALITIES.has(card.legality)) report.warn("unknown-legality", `${card.name} : légalité « ${card.legality} » inconnue`, context);

  const name: Localized = { en: card.name };
  const baseName: Localized = { en: card.baseName };
  const rulesText: Localized = {};
  if (card.rulesText !== null) rulesText.en = card.rulesText;
  else report.info("missing-rules-text", `${card.name} : pas de texte de règles anglais`, context);

  const hasSubtitle = card.name !== card.baseName;
  for (const [language, list] of groupBy(entries, (entry) => entry.printing.language)) {
    checkTextConsistency(card, language, list, report);
    if (language === "en") continue;

    const reference = referencePrinting(list);
    const localizedName = reference.source.localizedName;
    if (localizedName === null) {
      report.warn("missing-localized-name", `${describe(card, reference.source)} : pas de nom localisé`, printingContext(card, reference.source));
    } else {
      name[language] = localizedName;
      const localizedBaseName = deriveBaseName(localizedName, hasSubtitle);
      if (localizedBaseName === null) {
        report.warn(
          "unexpected-name-format",
          `${card.name} : nom « ${localizedName} » (${language}) ${hasSubtitle ? `sans exactement un « ${SUBTITLE_SEPARATOR.trim()} »` : `avec un « ${SUBTITLE_SEPARATOR.trim()} » alors que le nom anglais n'a pas de sous-titre`}`,
          { ...context, language },
        );
      } else {
        baseName[language] = localizedBaseName;
      }
    }
    if (reference.source.printedRulesText !== null) rulesText[language] = reference.source.printedRulesText;
    else if (card.rulesText !== null) report.info("missing-rules-text", `${card.name} : pas de texte de règles en « ${language} »`, { ...context, language });
  }

  return {
    id: card.id,
    slug: card.slug,
    type,
    color,
    classifications: card.classifications,
    keywords: card.keywords,
    cost: card.cost,
    power: card.power,
    ram: card.ram,
    eddiable: card.eddiable,
    legal: card.legality === "legal",
    name,
    baseName,
    rulesText,
  };
}

/**
 * Keeps a printing's own text when it differs from the card's text in its language
 * (Iconic arts without reminder text, source anomalies), so that the app can show
 * exactly what is printed.
 */
function addPrintedRulesTexts(entries: Entry[], cards: Map<string, Card>): void {
  for (const { printing, source } of entries) {
    const cardText = cards.get(printing.cardId)?.rulesText[printing.language];
    if (source.printedRulesText !== null && source.printedRulesText !== cardText) {
      printing.printedRulesText = source.printedRulesText;
    }
  }
}

/** Names must agree across all printings of a language; texts only across non-Iconic ones (Iconic arts omit reminder text). */
function checkTextConsistency(card: SourceCard, language: LanguageCode, entries: Entry[], report: Report): void {
  const names = distinct(entries.map((entry) => entry.source.localizedName));
  if (names.length > 1) {
    report.warn("divergent-localized-name", `${card.name} : noms différents en « ${language} » : ${listByPrinting(entries, (s) => s.localizedName)}`, {
      cardId: card.id,
      language,
    });
  }
  const regular = entries.filter((entry) => !entry.rarity.iconic);
  if (distinct(regular.map((entry) => entry.source.printedRulesText)).length > 1) {
    report.warn("divergent-rules-text", `${card.name} : textes imprimés différents en « ${language} » (impressions non-Iconic ${regular.map((e) => e.source.collectorNumber).join(", ")})`, {
      cardId: card.id,
      language,
      printingIds: regular.map((entry) => entry.printing.id),
    });
  }
}

/** Preferred printing for a card's localized texts: a non-Iconic printing of a main release, else the first one. */
function referencePrinting(entries: Entry[]): Entry {
  return entries.find((entry) => entry.release.group === "main" && !entry.rarity.iconic) ?? entries[0]!;
}

/** Localized name without subtitle, or null if the name does not follow the English structure. */
export function deriveBaseName(localizedName: string, hasSubtitle: boolean): string | null {
  const parts = localizedName.split(SUBTITLE_SEPARATOR);
  if (hasSubtitle) return parts.length === 2 ? parts[0]! : null;
  return parts.length === 1 ? localizedName : null;
}

function compareEntries(languages: LanguageCode[]): (a: Entry, b: Entry) => number {
  return (a, b) =>
    a.release.order - b.release.order ||
    compareStrings(a.release.id, b.release.id) ||
    compareStrings(a.printing.sortKey, b.printing.sortKey) ||
    languages.indexOf(a.printing.language) - languages.indexOf(b.printing.language) ||
    compareStrings(a.printing.id, b.printing.id);
}

function describe(card: SourceCard, printing: SourcePrinting): string {
  return `${card.name} [${printing.editionCode} ${printing.collectorNumber} ${printing.language}]`;
}

function printingContext(card: SourceCard, printing: SourcePrinting) {
  return { cardId: card.id, printingId: printing.id, sourceCode: printing.editionCode, collectorNumber: printing.collectorNumber, language: printing.language };
}

function listByPrinting(entries: Entry[], value: (source: SourcePrinting) => string | null): string {
  return entries.map((entry) => `${entry.source.collectorNumber} « ${value(entry.source)} »`).join(", ");
}

function distinct<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    const group = groups.get(k);
    if (group) group.push(item);
    else groups.set(k, [item]);
  }
  return groups;
}

function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
