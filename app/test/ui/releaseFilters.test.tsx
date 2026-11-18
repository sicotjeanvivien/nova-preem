// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { createMemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setViewportWidth, TestApp } from "./harness.tsx";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Card filters of the cards of a release (docs/app-spec.md §5.1.1) in the common filter panel (§8.1).

const RARE_MISSING_UNITS = ["009", "014", "022", "042", "044", "046", "088", "089", "117", "119", "123"];

describe("card filters of a release (step 9)", () => {
  let container: HTMLDivElement;
  let root: Root;
  let router: ReturnType<typeof createMemoryRouter>;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    setViewportWidth(1024);
  });

  const mount = (path: string) =>
    act(async () => root.render(<TestApp key={path} path={path} onRouter={(created) => (router = created)} />));
  const url = () => `${router.state.location.pathname}${router.state.location.search}`;
  const click = (element: Element | null | undefined) => {
    if (!element) throw new Error("nothing to click");
    return act(async () => (element as HTMLElement).click());
  };
  const buttons = (scope: ParentNode = container) => [...scope.querySelectorAll("button")];
  const button = (name: string | RegExp, scope: ParentNode = container) =>
    buttons(scope).find((b) => (typeof name === "string" ? b.textContent?.trim() === name : name.test(b.textContent?.trim() ?? "")));
  const byLabel = (label: string) => container.querySelector(`[aria-label="${label}"]`);
  const numbers = () => [...container.querySelectorAll(".tile__number")].map((n) => n.textContent?.trim());
  const panel = () => container.querySelector('[aria-label="Filtres de cartes"]')!;
  const type = (input: HTMLInputElement, value: string) =>
    act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });

  /** Retail, "Manquantes", then Rare + Unité in the panel. */
  const filterRareMissingUnits = async () => {
    await mount("/sets/wnc/wnc-retail");
    await click(button("Manquantes"));
    await click(button("Filtres"));
    await click(button(/^Rare\d+$/, panel()));
    await click(button(/^Unité\d+$/, panel()));
  };

  for (const [width, layout] of [
    [390, "mobile"],
    [1280, "desktop"],
  ] as const) {
    it(`${layout}: Missing + Rare + Unit, kept through the card page (previous / next) and a reload`, async () => {
      setViewportWidth(width);
      await filterRareMissingUnits();
      expect(url()).toBe("/sets/wnc/wnc-retail?filtre=manquantes&rarete=rare&type=unit");
      expect(numbers()).toEqual(RARE_MISSING_UNITS);
      // Each option gives the number of cards it would give with the other filters.
      expect(button(/^Rare\d+$/, panel())?.textContent).toBe("Rare11");
      expect(button(/^Unité\d+$/, panel())?.getAttribute("aria-pressed")).toBe("true");
      await click(button("Voir 11 cartes", panel()));
      expect(container.querySelector('[aria-label="Filtres de cartes"]')).toBeNull();

      // Active chips, with "shown / total", and the count on the button.
      expect(container.querySelector(".active-filters")?.textContent).toBe("11 / 172RareUnitéTout effacer");
      expect(button(/^Filtres/)?.textContent).toMatch(/^Filtres · 2/);

      // The card page browses the same list, in the same order.
      await click(byLabel("Ouvrir la carte Meredith Stout — Corpo Sans Pitié, numéro 014"));
      expect(container.querySelector("h1")?.textContent).toBe("Meredith Stout");
      await click(byLabel("Carte suivante : 022 Yorinobu Arasaka — Dragon D'acier"));
      await click(byLabel("Carte précédente : 014 Meredith Stout — Corpo Sans Pitié"));
      await click(byLabel("Carte précédente : 009 El Sombrerón — La Venganza Lenta"));
      expect(container.querySelector("h1")?.textContent).toBe("El Sombrerón");
      await click(byLabel("Retour à Welcome to Night City · Retail"));
      expect(numbers()).toEqual(RARE_MISSING_UNITS);

      // Reload: the same URL gives the same page.
      const current = url();
      await mount(current);
      expect(numbers()).toEqual(RARE_MISSING_UNITS);
      expect(button("Manquantes")?.getAttribute("aria-pressed")).toBe("true");
    });
  }

  it("removes a chip, clears all, and offers to clear the filters when nothing matches", async () => {
    setViewportWidth(390);
    await mount("/sets/wnc/wnc-retail?rarete=rare&type=unit&nom=zzz");
    expect(container.textContent).toContain("Aucune carte pour ces filtres.");
    expect(container.querySelector(".active-filters")?.textContent).toBe("0 / 172« zzz »RareUnitéTout effacer");

    await click(byLabel("Retirer le filtre Rareté : Rare"));
    expect(url()).toBe("/sets/wnc/wnc-retail?type=unit&nom=zzz");
    await click(button("Effacer les filtres"));
    expect(url()).toBe("/sets/wnc/wnc-retail");
    expect(numbers()).toHaveLength(172);
    expect(container.querySelector(".active-filters")).toBeNull();
  });

  it("filters by name or number in the panel, keeping the entry language and the possession filter outside it", async () => {
    setViewportWidth(390);
    await mount("/sets/wnc/wnc-retail?langue=en&filtre=manquantes");
    await click(button("Filtres"));
    const sheet = container.querySelector('[role="dialog"]')!;
    expect(sheet.getAttribute("aria-label")).toBe("Filtres de cartes");
    // The entry language and the possession filters are not in the panel.
    expect(sheet.textContent).not.toContain("Manquantes");
    expect(sheet.textContent).not.toContain("Saisie en");
    await type(sheet.querySelector<HTMLInputElement>('input[type="search"]')!, "jonin");
    expect(numbers()).toEqual(["010"]);
    expect(url()).toBe("/sets/wnc/wnc-retail?langue=en&filtre=manquantes&nom=jonin");
    expect(container.textContent).toContain("1 variante manquante parmi les filtres");
    await click(button("Réinitialiser", sheet));
    expect(url()).toBe("/sets/wnc/wnc-retail?langue=en&filtre=manquantes");
  });

  it("desktop: the panel unfolds under the toolbar and the copy button says it copies the filtered list", async () => {
    setViewportWidth(1280);
    await mount("/sets/wnc/wnc-retail?filtre=manquantes&couleur=green");
    const toggle = button(/^Filtres/)!;
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    await click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(panel().tagName).toBe("SECTION");
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect([...panel().querySelectorAll(".filters-panel__title")].map((t) => t.textContent)).toEqual(["Nom ou numéro", "Rareté", "Type", "Couleur", "Coût"]);
    expect(button(/^Copier les \d+ manques parmi les filtres$/)).toBeTruthy();
    await click(toggle);
    expect(container.querySelector('[aria-label="Filtres de cartes"]')).toBeNull();
  });
});
