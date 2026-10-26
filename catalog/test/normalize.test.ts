import { describe, expect, it } from "vitest";
import type { Catalog } from "../src/model.ts";
import { deriveBaseName, normalize, sortKey, stripBetaPrefix } from "../src/normalize.ts";
import { Report } from "../src/report.ts";
import { loadSamplePage, normalizeSample, snapshotFrom } from "./helpers.ts";

type Normalized = Omit<Catalog, "schemaVersion" | "generatedAt" | "source">;

function cardBySlug(catalog: Normalized, slug: string) {
  const card = catalog.cards.find((c) => c.slug === slug);
  if (!card) throw new Error(`no card ${slug}`);
  return { card, printings: catalog.printings.filter((p) => p.cardId === card.id) };
}

describe("collector numbers", () => {
  it("strips only the Beta prefix", () => {
    expect(stripBetaPrefix("β003")).toBe("003");
    expect(stripBetaPrefix("β005a")).toBe("005a");
    expect(stripBetaPrefix("003")).toBe("003");
  });

  it("builds sortable keys, suffixes and malformed numbers included", () => {
    expect(sortKey("003")).toBe("0003");
    expect(sortKey("10")).toBe("0010");
    expect(sortKey("005a")).toBe("0005a");
    expect(sortKey("X-12")).toBe("~X-12");
    expect(["005b", "006", "005", "005a", "10", "X"].map(sortKey).sort()).toEqual(["0005", "0005a", "0005b", "0006", "0010", "~X"]);
  });
});

describe("localized base names", () => {
  it("keeps the part before the subtitle when the English name has one", () => {
    expect(deriveBaseName("Johnny Silverhand — Rock'n'Rebelle", true)).toBe("Johnny Silverhand");
    expect(deriveBaseName("Johnny Silverhand", true)).toBeNull();
    expect(deriveBaseName("A — B — C", true)).toBeNull();
  });

  it("keeps the whole name when the English name has no subtitle", () => {
    expect(deriveBaseName("Croc Chromé", false)).toBe("Croc Chromé");
    expect(deriveBaseName("Croc — Chromé", false)).toBeNull();
  });
});

describe("normalize (real fixture)", () => {
  const { catalog, report } = normalizeSample();

  it("splits Netdeck editions into set, release and language", () => {
    expect(catalog.languages).toEqual(["en", "fr"]);
    expect(catalog.sets.map((set) => set.id)).toEqual(["wnc"]);
    const retail = catalog.releases.find((release) => release.id === "wnc-retail")!;
    expect(retail).toMatchObject({
      setId: "wnc",
      group: "main",
      languages: ["en", "fr"],
      sourceCodes: ["welcometonightcityretail", "welcometonightcityretail-fr"],
    });
    expect(catalog.releases.map((r) => r.order)).toEqual([...catalog.releases.map((r) => r.order)].sort((a, b) => a - b));
  });

  it("links the English and French printings of the same card through the variant key", () => {
    const { card, printings } = cardBySlug(catalog, "johnny-silverhand-rocking-renegade");
    const retail = printings.filter((p) => p.variantKey === "wnc-retail#003");
    expect(retail.map((p) => [p.language, p.collectorNumber, p.sourceCode])).toEqual([
      ["en", "003", "welcometonightcityretail"],
      ["fr", "003", "welcometonightcityretail-fr"],
    ]);
    expect(new Set(retail.map((p) => p.id)).size).toBe(2);

    const beta = printings.filter((p) => p.releaseId === "wnc-beta");
    expect(beta.map((p) => [p.collectorNumber, p.variantKey, p.rarityId])).toEqual([
      ["β003", "wnc-beta#003", "secret"],
      ["β168", "wnc-beta#168", "iconic-secret"],
    ]);

    expect(card.name).toEqual({ en: "Johnny Silverhand — Rocking Renegade", fr: "Johnny Silverhand — Rock'n'Rebelle" });
    expect(card.baseName).toEqual({ en: "Johnny Silverhand", fr: "Johnny Silverhand" });
    expect(card.rulesText.fr).toMatch(/^2 €\$, \{Spend\} Une Unité alliée/);
    expect(card).toMatchObject({ type: "legend", color: "red", legal: true, cost: null, ram: 2 });
  });

  it("reports the Beta-only Iconic as missing from Retail, without inventing a match", () => {
    const missing = report.byCode("missing-retail-counterpart").map((a) => a.context.collectorNumber);
    expect(missing).toContain("β168");
  });

  it("keeps the a/b suffixes as two distinct variants (two arts)", () => {
    const { printings } = cardBySlug(catalog, "v-streetkid");
    const retailEn = printings.filter((p) => p.releaseId === "wnc-retail" && p.language === "en");
    expect(retailEn.map((p) => [p.collectorNumber, p.variantKey, p.sortKey])).toEqual([
      ["005a", "wnc-retail#005a", "0005a"],
      ["005b", "wnc-retail#005b", "0005b"],
      ["144", "wnc-retail#144", "0144"],
    ]);
  });

  it("takes localized rules text from a regular printing, not from an Iconic one", () => {
    const { card } = cardBySlug(catalog, "v-streetkid");
    expect(card.rulesText.fr).toContain("(Payez le coût de cette Légende");
    const divergent = report.byCode("divergent-rules-text").map((a) => a.context.cardId);
    expect(divergent).not.toContain(card.id);
  });

  it("keeps a printing's own text only when it differs from the card's text", () => {
    const v = cardBySlug(catalog, "v-streetkid");
    const french = new Map(v.printings.filter((p) => p.language === "fr").map((p) => [p.collectorNumber, p]));
    expect(french.get("005a")).not.toHaveProperty("printedRulesText");
    expect(french.get("144")!.printedRulesText).toContain("{Go Solo}");
    expect(french.get("144")!.printedRulesText).not.toContain("(Payez");
    expect(v.printings.filter((p) => p.language === "en").every((p) => p.printedRulesText === undefined)).toBe(true);

    // Retail EN 093 lacks the reminder text of the official (card) text.
    const overwatch = cardBySlug(catalog, "overwatch-panam-s-gift");
    const withOwnText = overwatch.printings.filter((p) => p.printedRulesText !== undefined);
    expect(withOwnText.map((p) => [p.sourceCode, p.collectorNumber])).toEqual([
      ["welcometonightcityretail", "093"],
      ["welcometonightcityretail-fr", "165"],
      ["welcometonightcitybeta", "β165"],
    ]);
    expect(overwatch.card.rulesText.en).toMatch(/^\(Equip to/);
    expect(withOwnText[0]!.printedRulesText).toMatch(/^\{Quick\}/);
  });

  it("reports a localized name that differs between printings, keeping the regular one", () => {
    const { card } = cardBySlug(catalog, "towerfall");
    expect(card.name.fr).toBe("Destruction de Tour");
    expect(report.byCode("divergent-localized-name").map((a) => a.context.cardId)).toEqual([card.id]);
  });

  it("reports the malformed number without fixing it", () => {
    const { printings } = cardBySlug(catalog, "over-the-edge");
    const starter = printings.find((p) => p.releaseId === "embracing-power-starter-retail")!;
    expect(starter).toMatchObject({ collectorNumber: "10", variantKey: "embracing-power-starter-retail#10", sortKey: "0010" });
    expect(report.byCode("malformed-collector-number").map((a) => a.context.collectorNumber)).toEqual(["10"]);
  });

  it("keeps a non-legal card without rules text", () => {
    const { card, printings } = cardBySlug(catalog, "rebecca-having-a-moment");
    expect(card.legal).toBe(false);
    expect(card.rulesText).toEqual({});
    expect(printings.map((p) => [p.releaseId, p.rarityId])).toEqual([
      ["set1-promos", "nova-rare"],
      ["set1-promos", "nova-rare"],
    ]);
    expect(report.byCode("missing-rules-text").map((a) => a.context.cardId)).toContain(card.id);
  });

  it("handles a card that only exists in starter decks and promos", () => {
    const { card, printings } = cardBySlug(catalog, "yorinobu-arasaka-embracing-destruction");
    expect(card.name).toEqual({ en: "Yorinobu Arasaka — Embracing Destruction" });
    expect(new Set(printings.map((p) => p.language))).toEqual(new Set(["en"]));
    expect(printings.some((p) => p.releaseId.startsWith("wnc-"))).toBe(false);
  });

  it("keeps source texts verbatim", () => {
    const { card } = cardBySlug(catalog, "rogue-amendiares-queen-of-the-afterlife");
    expect(card.rulesText.en).toContain("2 €$,  {Spend}");
  });

  it("does not report anything unexpected on the sample", () => {
    const codes = new Set(report.anomalies.map((a) => a.code));
    for (const code of ["unknown-edition", "unknown-rarity", "language-mismatch", "duplicate-printing-key", "variant-card-conflict", "missing-translation"] as const) {
      expect(codes).not.toContain(code);
    }
  });

  it("sorts cards by English name and printings by release, number and language", () => {
    const names = catalog.cards.map((c) => c.name.en!);
    expect(names).toEqual([...names].sort(new Intl.Collator("en").compare));
    const releaseOrder = new Map(catalog.releases.map((r) => [r.id, r.order]));
    const languages = catalog.languages;
    for (let i = 1; i < catalog.printings.length; i++) {
      const [a, b] = [catalog.printings[i - 1]!, catalog.printings[i]!];
      const order = releaseOrder.get(a.releaseId)! - releaseOrder.get(b.releaseId)!
        || a.sortKey.localeCompare(b.sortKey)
        || languages.indexOf(a.language) - languages.indexOf(b.language);
      expect(order).toBeLessThanOrEqual(0);
    }
  });

  it("is deterministic, whatever the order of the source", () => {
    const reversed = normalizeSample((page) => {
      page.items.reverse();
      for (const item of page.items) item.printings.reverse();
    });
    expect(JSON.stringify(reversed.catalog)).toBe(JSON.stringify(catalog));
    expect(JSON.stringify(reversed.report.anomalies)).toBe(JSON.stringify(report.anomalies));
  });
});

describe("normalize (anomalies)", () => {
  it("fails on duplicate printing identifiers", () => {
    const page = loadSamplePage();
    page.items[1].printings[1].id = page.items[0].printings[0].id;
    expect(() => normalize(snapshotFrom(page), new Report())).toThrow(/Duplicate identifiers/);
  });

  it("fails on duplicate card identifiers", () => {
    const page = loadSamplePage();
    page.items[1].id = page.items[0].id;
    expect(() => normalize(snapshotFrom(page), new Report())).toThrow(/Duplicate identifiers/);
  });

  it("puts an unknown edition code in an unknown release instead of crashing", () => {
    const { catalog, report } = normalizeSample((page) => {
      page.items[0].printings[0].set.code = "edgerunnersburnbright";
    });
    const release = catalog.releases.find((r) => r.id === "unknown-edgerunnersburnbright")!;
    expect(release).toMatchObject({ setId: "unknown", group: "unknown", sourceCodes: ["edgerunnersburnbright"] });
    expect(catalog.sets.map((s) => s.id)).toEqual(["wnc", "unknown"]);
    expect(report.byCode("unknown-edition")).toHaveLength(1);
  });

  it("trusts the printing language and reports a contradiction with the edition", () => {
    const { catalog, report } = normalizeSample((page) => {
      const french = page.items[0].printings.find((p: any) => p.language === "fr");
      french.language = "en";
    });
    expect(report.byCode("language-mismatch")).toHaveLength(1);
    expect(report.byCode("duplicate-printing-key")).toEqual([]);
    expect(catalog.printings.filter((p) => p.sourceCode === "welcometonightcityretail-fr" && p.language === "en")).toHaveLength(1);
  });

  it("keeps and reports an unknown rarity", () => {
    const { catalog, report } = normalizeSample((page) => {
      page.items[0].printings[0].rarity = "Ultra Secret";
    });
    expect(catalog.rarities.at(-1)).toMatchObject({ id: "ultra-secret", order: 10 });
    expect(catalog.printings.filter((p) => p.rarityId === "ultra-secret")).toHaveLength(1);
    expect(report.byCode("unknown-rarity")).toHaveLength(1);
  });

  it("reports a printing without its translation in a bilingual release", () => {
    const { report } = normalizeSample((page) => {
      const johnny = page.items.find((item: any) => item.slug === "johnny-silverhand-rocking-renegade");
      johnny.printings = johnny.printings.filter((p: any) => p.language !== "fr");
    });
    expect(report.byCode("missing-translation").map((a) => [a.context.variantKey, a.context.language])).toEqual([["wnc-retail#003", "fr"]]);
  });

  it("reports a localized name that does not follow the English structure, and omits its base name", () => {
    const { catalog, report } = normalizeSample((page) => {
      for (const p of page.items[0].printings) if (p.language === "fr") p.localized_name = "Johnny Silverhand Rock'n'Rebelle";
    });
    const { card } = cardBySlug(catalog, "johnny-silverhand-rocking-renegade");
    expect(card.baseName).toEqual({ en: "Johnny Silverhand" });
    expect(report.byCode("unexpected-name-format")).toHaveLength(1);
  });

  it("reports a placeholder artist and an artist that differs between languages or between Beta and Retail", () => {
    let johnnyId = "";
    const { report } = normalizeSample((page) => {
      const johnny = page.items.find((item: any) => item.slug === "johnny-silverhand-rocking-renegade");
      johnny.printings.find((p: any) => p.set.code === "welcometonightcityretail").artist = "TBD";
      johnnyId = johnny.id;
    });
    expect(report.byCode("placeholder-artist")).toHaveLength(1);
    expect(report.byCode("variant-mismatch").map((a) => [a.context.variantKey, a.context.field])).toEqual([["wnc-retail#003", "artist"]]);
    // The sample also contains real Beta/Retail artist differences on Iconic arts.
    const johnnyMismatches = report.byCode("counterpart-mismatch").filter((a) => a.context.cardId === johnnyId);
    expect(johnnyMismatches.map((a) => a.context.field)).toEqual(["artist"]);
  });

  it("reports two cards sharing the same number in a release", () => {
    const { report } = normalizeSample((page) => {
      const chrome = page.items.find((item: any) => item.slug === "chrome-fang");
      const johnny = page.items.find((item: any) => item.slug === "johnny-silverhand-rocking-renegade");
      const target = chrome.printings.find((p: any) => p.set.code === "welcometonightcityretail");
      target.collector_number = johnny.printings.find((p: any) => p.set.code === "welcometonightcityretail").collector_number;
    });
    expect(report.byCode("variant-card-conflict").map((a) => a.context.variantKey)).toEqual(["wnc-retail#003"]);
  });
});
