// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { printingOf } from "../helpers-catalog.ts";
import { entry, setViewportWidth, TestApp, text } from "./harness.tsx";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const owned = [entry(printingOf("Chrome Fang", "wnc-retail", "fr").id, 3), entry(printingOf("Chrome Fang", "embracing-power-starter-retail", "en").id, 1)];

describe("Search, mobile layout (server rendering)", () => {
  const render = (path: string) => text(renderToString(<TestApp path={path} entries={owned} />));

  it("lists every card, the filters behind the Filtres button at the right of the field (§8.1)", () => {
    const content = render("/recherche");
    expect(content).toContain("152 cartes · tous sets, VF et VO");
    expect(content).toMatch(/Rechercher une carte Filtres/);
    // No row of menus nor type chips any more: they are in the panel.
    expect(content).not.toContain("Tous types");
    expect(content).not.toContain("Tout effacer");
  });

  it("shows the active filters from the URL as removable chips", () => {
    const content = render("/recherche?cout=7%2B&type=unit&ram=2&texte=1");
    expect(content).toMatch(/Filtres · 4/);
    expect(content).toMatch(/Unité Coût 7 et plus RAM 2 Texte de règles Tout effacer/);
  });

  it("finds a card by its English name, shown with the VO prefix, and its ownership", () => {
    const content = render("/recherche?q=fang");
    expect(content).toContain("1 carte · tous sets, VF et VO");
    expect(content).toMatch(/Croc Chromé VO : Chrome Fang Unité · Retail #008 · Beta #β008 · Embracing Power — Retail #002/);
    expect(content).toContain("Possédée ×4");
  });

  it("marks missing cards and applies the filters from the URL", () => {
    expect(render("/recherche?q=johnny&possession=missing")).toContain("Manquante");
    expect(render("/recherche?q=fang&possession=missing")).toContain("Aucune carte ne correspond.");
    expect(render("/recherche?cout=7%2B&type=unit")).toMatch(/\d+ cartes? · tous sets/);
  });
});

describe("Search, interactions", () => {
  let container: HTMLDivElement;
  let root: Root;

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

  const typeQuery = async (value: string) => {
    const input = container.querySelector<HTMLInputElement>("#search-query")!;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      setter.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  };
  const count = () => container.querySelector(".search-results__count")?.textContent;

  it("searches as you type, opens a result and comes back to the same query", async () => {
    setViewportWidth(390);
    await act(async () => root.render(<TestApp path="/recherche" entries={owned} />));
    await typeQuery("jonin");
    expect(count()).toBe("1 carte · tous sets, VF et VO");
    expect(container.textContent).toContain("Jônin De Japantown");

    await act(async () => container.querySelector<HTMLAnchorElement>(".collection-row")!.click());
    expect(container.querySelector("h1")?.textContent).toBe("Jônin De Japantown");
    await act(async () => container.querySelector<HTMLElement>('[aria-label="Retour à Recherche"]')!.click());
    expect(container.querySelector<HTMLInputElement>("#search-query")!.value).toBe("jonin");
    expect(count()).toBe("1 carte · tous sets, VF et VO");
  });

  const button = (name: string, scope: ParentNode = container) => [...scope.querySelectorAll("button")].find((b) => b.textContent?.trim() === name);
  const titles = (scope: Element) => [...scope.querySelectorAll(".filters-panel__title")].map((t) => t.textContent);
  const ORDER = ["Type", "Possession", "Couleur", "Rareté", "Set", "Coût", "RAM", "Texte"];

  it("shows a grid of cards on desktop, the filters in a panel unfolded under the field", async () => {
    setViewportWidth(1280);
    await act(async () => root.render(<TestApp path="/recherche" entries={owned} />));
    expect(container.querySelectorAll(".result-card")).toHaveLength(152);
    expect(container.querySelector("aside")).toBeNull();
    await act(async () => button("Filtres")!.click());
    const panel = container.querySelector('section[aria-label="Filtres"]')!;
    expect(titles(panel)).toEqual(ORDER);
    expect(panel.textContent).toContain("Chercher aussi dans le texte de règles");
    await act(async () => button("Légende", panel)!.click());
    expect(container.querySelectorAll(".result-card")).toHaveLength(28);
    // One type at a time, "Tous types" to clear it, as in the mockups.
    await act(async () => button("Unité", panel)!.click());
    expect(button("Légende", panel)!.getAttribute("aria-pressed")).toBe("false");
    await act(async () => button("Tous types", panel)!.click());
    await act(async () => button("Voir 152 cartes", panel)!.click());
    expect(container.querySelector('section[aria-label="Filtres"]')).toBeNull();
  });

  it("mobile: the same filters in a sheet, with chips once closed", async () => {
    setViewportWidth(390);
    await act(async () => root.render(<TestApp path="/recherche" entries={owned} />));
    await act(async () => button("Filtres")!.click());
    const sheet = container.querySelector('[role="dialog"]')!;
    expect(titles(sheet)).toEqual(ORDER);
    await act(async () => button("Possédées", sheet)!.click());
    await act(async () => button("Voir 1 carte", sheet)!.click());
    expect(count()).toBe("1 carte · tous sets, VF et VO");
    expect(container.querySelector(".active-filters")?.textContent).toBe("PossédéesTout effacer");
    await act(async () => container.querySelector<HTMLElement>('[aria-label="Retirer le filtre Possession : Possédées"]')!.click());
    expect(count()).toBe("152 cartes · tous sets, VF et VO");
  });
});
