// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatTotal } from "../../src/domain/prices.ts";
import { DEFAULT_SETTINGS, type Settings } from "../../src/domain/settings.ts";
import type { PriceServices } from "../../src/platform/services.ts";
import { index } from "../helpers-catalog.ts";
import { DEMO_COLLECTION, DEMO_PRICES, DEMO_PRICES_FILE, fakePriceSource, MemoryPriceStore } from "../helpers-prices.ts";
import { entry, setOnline, setViewportWidth, TestApp } from "./harness.tsx";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const NOW = new Date("2026-11-18T12:00:00.000Z");
const plain = (value: string | null | undefined) => (value ?? "").replace(/ /g, " ").replace(/\s+/g, " ").trim();

function printingId(variantKey: string, language: string): string {
  const printing = index.catalog.printings.find((p) => p.variantKey === variantKey && p.language === language);
  if (!printing) throw new Error(`no printing ${variantKey} ${language}`);
  return printing.id;
}

const DEMO_ENTRIES = DEMO_COLLECTION.map(([key, language, quantity]) => entry(printingId(key, language), quantity));
/** Sum of the real prices × quantities of the demonstration collection, computed here independently. */
const DEMO_TOTAL = DEMO_COLLECTION.reduce((sum, [key, , quantity]) => sum + (DEMO_PRICES[key] ?? 0) * quantity, 0);

const priceServices = (file = DEMO_PRICES_FILE): PriceServices => ({
  store: new MemoryPriceStore({ file, downloadedAt: NOW.toISOString() }),
  source: fakePriceSource(file),
});

describe("Indicative prices on the screens", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
    setOnline(true);
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.useRealTimers();
    setViewportWidth(1024);
  });

  const show = (path: string, options: { width?: number; settings?: Settings; prices?: PriceServices | null; language?: "fr" | "en" } = {}) => {
    setViewportWidth(options.width ?? 390);
    return act(async () =>
      root.render(
        <TestApp
          key={`${path} ${Math.random()}`}
          path={path}
          entries={DEMO_ENTRIES}
          settings={options.settings ?? DEFAULT_SETTINGS}
          services={{ prices: options.prices === undefined ? priceServices() : options.prices }}
          {...(options.language && { language: options.language })}
        />,
      ),
    );
  };
  const all = (selector: string) => [...container.querySelectorAll<HTMLElement>(selector)];
  const textOf = (selector: string) => plain(container.querySelector(selector)?.textContent);

  describe("Stats", () => {
    it.each([390, 1280])("shows the total of the demonstration collection, rounded by the rule (%i px)", async (width) => {
      await show("/stats", { width });
      expect(textOf(".value-card__total")).toBe(plain(formatTotal(DEMO_TOTAL, "fr")));
      expect(textOf(".value-card__total")).toBe("≈ 280 €");
      expect(textOf(".value-card__meta")).toBe("21 cartes estimées · 3 sans prix");
      expect(textOf(".value-card__date")).toBe("Prix du 17/11");
    });

    it.each([390, 1280])("shows the value by release and the five most expensive cards (%i px)", async (width) => {
      await show("/stats", { width });
      expect(all(".value-row").map((row) => plain(row.textContent))).toEqual(["Retail≈ 150 €", "Beta≈ 120 €", "Starters< 1 €", "Promos≈ 5 €"]);
      expect(all(".value-top__link").map((link) => plain(link.textContent))).toEqual([
        "1Adam Smasher — Ender of LegendsBeta #β141 · VO≈ 120 €",
        "2V — Gosse Des RuesRetail #144 · VF≈ 70 €",
        "3Adam Smasher — Acheveur De LégendesRetail #141 · VF≈ 65 €",
        "4Johnny Silverhand — Rock'n'RebelleRetail #003 · VF≈ 14 €",
        "5Kerry Eurodyne — The Last RockerboyNight City Brawl S1 #001 · VO≈ 4,50 €",
      ]);
      expect(all(".value-top__link")[0]!.getAttribute("href")).toBe("/cartes/adam-smasher-ender-of-legends");
    });

    it("shows old prices in amber", async () => {
      await show("/stats", { prices: priceServices({ ...DEMO_PRICES_FILE, sourceDate: "2026-11-09T02:50:00+01:00" }) });
      expect(container.querySelector(".value-card__date .prices-old")?.textContent).toBe("Prix anciens · 09/11");
    });
  });

  describe("cards of a release", () => {
    it("shows the rounded price of each card bottom right, the other language bottom left", async () => {
      await show("/sets/wnc/wnc-retail");
      const tile = (number: string) => all(".tile").find((t) => t.querySelector(".tile__number")?.textContent === number)!;
      expect(plain(tile("141").querySelector(".tile__price")?.textContent)).toBe("Prix indicatif ≈ 65 €");
      expect(plain(tile("008").querySelector(".tile__price")?.textContent)).toBe("Prix indicatif < 0,10 €");
      expect(plain(tile("020").querySelector(".tile__price")?.textContent)).toBe("Prix indicatif ≈ 1,00 €");
      // Not in the demonstration prices: no price.
      expect(plain(tile("001").querySelector(".tile__price")?.textContent)).toBe("Prix indicatif —");
      expect(tile("025").querySelector(".tile__other")?.textContent).toBe("VO 1");
    });
  });

  describe("releases of a set", () => {
    it("shows the value of each complete release, or « Pas de prix »", async () => {
      await show("/sets/wnc");
      const tile = (name: string) => all(".release-tile").find((t) => t.querySelector(".release-tile__name")?.textContent === name)!;
      const retail = tile("Retail").querySelector(".release-tile__value")!;
      expect(plain(retail.textContent)).toBe("Valeur du tirage complet ≈ 170 €");
      expect(retail.getAttribute("title")).toBe("Un exemplaire de chaque carte · 161 sans prix");
      const edgerunner = tile("Edgerunner Open S1").querySelector(".release-tile__value")!;
      expect(edgerunner.textContent).toBe("Pas de prix");
      expect(edgerunner.classList).toContain("release-tile__value--none");
      expect(plain(tile("Retail").querySelector(".release-tile__banner .release-tile__languages")?.textContent)).toBe("VOVF");
    });
  });

  describe("card page", () => {
    it.each([390, 1280])("shows the price of each printing, then the source (%i px)", async (width) => {
      await show("/cartes/adam-smasher-ender-of-legends", { width });
      const prices = all(width < 900 ? ".printing-card__price" : "td.printing-table__price").map((cell) => plain(cell.textContent));
      expect(prices).toContain("Prix indicatif ≈ 65 €");
      expect(prices).toContain("Prix indicatif ≈ 120 €");
      expect(textOf(".price-source")).toBe("Prix indicatifs Cardmarket, toutes langues confondues · 17/11");
    });
  });

  describe("Collection", () => {
    it("adds the price to each card and the value of the selection to the summary", async () => {
      await show("/collection");
      expect(textOf(".collection-header__summary")).toBe(`24 ex. · 17 impressions · ${plain(formatTotal(DEMO_TOTAL, "fr"))}`);
      const meta = all(".gallery-card__meta").map((m) => plain(m.textContent));
      expect(meta).toContain("Retail · #141 · ≈ 65 €");
      expect(meta).toContain("Edgerunner Open S1 · #001 · —");
    });

    it("counts only the selection shown, filters included", async () => {
      await show("/collection?langue=en");
      const englishTotal = DEMO_COLLECTION.filter(([, language]) => language === "en").reduce((sum, [key, , q]) => sum + (DEMO_PRICES[key] ?? 0) * q, 0);
      expect(textOf(".collection-header__summary")).toMatch(new RegExp(`· ${plain(formatTotal(englishTotal, "fr"))}$`));
    });

    it("sorts by value, cards without a price last", async () => {
      await show("/collection?tri=valeur");
      expect((container.querySelector("#collection-sort") as HTMLSelectElement).value).toBe("value");
      const keys = all(".gallery-card__meta").map((m) => plain(m.textContent));
      expect(keys.slice(0, 3)).toEqual(["Beta · #β141 · ≈ 120 €", "Retail · #144 · ≈ 70 €", "Retail · #141 · ≈ 65 €"]);
      expect(keys.slice(-2).every((meta) => meta.endsWith("—"))).toBe(true);
    });
  });

  describe("prices off or absent", () => {
    it.each([
      ["setting off", { settings: { ...DEFAULT_SETTINGS, indicativePrices: false } }],
      ["no prices URL", { prices: null }],
    ] as const)("shows no price anywhere (%s)", async (_case, options) => {
      for (const path of ["/stats", "/sets/wnc", "/sets/wnc/wnc-retail", "/cartes/adam-smasher-ender-of-legends", "/collection?tri=valeur"]) {
        await show(path, options);
        expect(container.textContent, path).not.toMatch(/≈|Pas de prix|Prix indicatifs Cardmarket|Valeur estimée/);
        expect(all(".tile__price, .release-tile__value, .value-card, .printing-card__price, .price-source")).toEqual([]);
      }
      // The value sort falls back to the default one.
      expect([...(container.querySelector("#collection-sort") as HTMLSelectElement).options].map((o) => o.value)).not.toContain("value");
      // The language badge stays bottom left.
      await show("/sets/wnc/wnc-retail", options);
      expect(all(".tile__other").length).toBeGreaterThan(0);
    });

    it("shows no price in Search", async () => {
      await show("/recherche?q=adam");
      expect(container.textContent).not.toMatch(/≈|Prix indicatif/);
    });
  });

  it("is translated", async () => {
    await show("/stats", { language: "en" });
    expect(textOf(".value-card__total")).toBe("≈ €280");
    expect(textOf(".value-card__meta")).toBe("21 cards valued · 3 without a price");
    expect(textOf(".value-card__date")).toBe("Prices of 11/17");
  });
});
