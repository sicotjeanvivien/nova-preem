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

  it("lists every card with the filters of the spec", () => {
    const content = render("/recherche");
    expect(content).toContain("151 cartes · tous sets, VF et VO");
    expect(content).toMatch(/Tous types Unité Légende Programme Équipement|Tous types (Légende|Unité|Programme|Équipement)/);
    expect(content).toContain("Chercher aussi dans le texte de règles");
    expect(content).toMatch(/Possession Couleur Rareté Set Coût RAM/);
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

  it("shows a grid of cards on desktop, with the type filter", async () => {
    setViewportWidth(1280);
    await act(async () => root.render(<TestApp path="/recherche" entries={owned} />));
    expect(container.querySelectorAll(".result-card")).toHaveLength(151);
    const legend = [...container.querySelectorAll("button")].find((b) => b.textContent === "Légende")!;
    await act(async () => legend.click());
    expect(container.querySelectorAll(".result-card")).toHaveLength(27);
  });
});
