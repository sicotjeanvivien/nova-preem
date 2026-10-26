import { describe, expect, it } from "vitest";
import { parseListPage, toSnapshot } from "../src/sources/netdeck.ts";
import { FETCHED_AT, loadSamplePage, snapshotFrom } from "./helpers.ts";

describe("Netdeck adapter", () => {
  it("maps a real list page to source-neutral cards", () => {
    const snapshot = snapshotFrom(loadSamplePage());
    expect(snapshot).toMatchObject({ source: "netdeck", fetchedAt: FETCHED_AT, total: 9 });

    const johnny = snapshot.cards.find((card) => card.slug === "johnny-silverhand-rocking-renegade")!;
    expect(johnny).toMatchObject({
      name: "Johnny Silverhand — Rocking Renegade",
      baseName: "Johnny Silverhand",
      type: "Legend",
      color: "Red",
      cost: null,
      ram: 2,
      eddiable: true,
      legality: "legal",
    });
    const french = johnny.printings.find((printing) => printing.language === "fr")!;
    expect(french).toMatchObject({
      collectorNumber: "003",
      editionCode: "welcometonightcityretail-fr",
      localizedName: "Johnny Silverhand — Rock'n'Rebelle",
      officialRulesText: null,
    });
    expect(french.imageVersion).toMatch(/^render-.+\.webp$/);
  });

  it("fails with a readable message when the format changes", () => {
    const page = loadSamplePage();
    delete page.items[1].printings[0].collector_number;
    expect(() => parseListPage(page)).toThrow(/unexpected format[\s\S]*collector_number/);

    const renamed = loadSamplePage();
    renamed.items[0].card_type = 42;
    expect(() => parseListPage(renamed)).toThrow(/card_type/);
  });

  it("fails when fewer cards than announced are received", () => {
    const page = loadSamplePage();
    page.total = 10;
    expect(() => snapshotFrom(page)).toThrow(/received 9 cards but the source announces 10/);
  });

  it("fails when the announced total changes between pages", () => {
    const first = loadSamplePage();
    const second = loadSamplePage();
    second.total = 18;
    expect(() =>
      toSnapshot([
        { fetchedAt: FETCHED_AT, page: parseListPage(first) },
        { fetchedAt: FETCHED_AT, page: parseListPage(second) },
      ]),
    ).toThrow(/total changed/);
  });
});
