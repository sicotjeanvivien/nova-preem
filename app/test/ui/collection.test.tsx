// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { CollectionEntry } from "../../src/domain/collection.ts";
import { printingOf } from "../helpers-catalog.ts";
import { setViewportWidth, TestApp, text } from "./harness.tsx";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const at = (iso: string, printingId: string, quantity: number): CollectionEntry => ({ printingId, quantity, firstAddedAt: iso, lastAddedAt: iso });
const mantisFr = printingOf("Mantis Blades", "wnc-retail", "fr");
const mantisEn = printingOf("Mantis Blades", "wnc-retail", "en");
const chromeFr = printingOf("Chrome Fang", "wnc-retail", "fr");
const chromeStarter = printingOf("Chrome Fang", "embracing-power-starter-retail", "en");
const entries = [
  at("2026-10-26T12:00:00Z", mantisFr.id, 2),
  at("2026-10-26T12:00:00Z", mantisEn.id, 1),
  at("2026-01-02T10:00:00Z", chromeFr.id, 3),
  at("2026-10-25T10:00:00Z", chromeStarter.id, 1),
];

describe("Collection gallery, mobile (server rendering)", () => {
  const render = (path: string) => renderToString(<TestApp path={path} entries={entries} />);

  it("shows one card image per owned variant, with rarity, quantities per language, name and release", () => {
    const html = render("/collection");
    const content = text(html);
    expect(content).toContain("7 ex. · 4 impressions");
    expect(content).toMatch(/Trier Ajouts récents Numéro Nom Rareté Quantité Filtres/);
    expect(content).toMatch(/C VF ×2 VO ×1 Lames Mantis Retail · #025 C VO ×1 Croc Chromé Embracing Power — Retail · #002 C VF ×3 Croc Chromé Retail · #008/);
    expect(html.split('class="gallery-card"').length - 1).toBe(3);
    expect(html).toContain('placeholder="Nom VF ou VO…"');
    // No + or − in the gallery: entry is done in Sets or on the card page.
    expect(html).not.toContain("Ajouter un exemplaire");
  });

  it("filters by language and shows the surplus of duplicates, per printing", () => {
    const vf = text(render("/collection?langue=fr"));
    expect(vf).toContain("5 ex. · 2 impressions");
    expect(vf).not.toContain("VO ×1");
    expect(vf).toContain("Filtres · 1");

    const duplicates = text(render("/collection?doublons=1"));
    expect(duplicates).toMatch(/C \+1 VF ×2 VO ×1 Lames Mantis/);
    expect(duplicates).toMatch(/C \+2 VF ×3 Croc Chromé/);
  });

  it("filters by name, French or English, without accents, and sorts from the URL", () => {
    expect(text(render("/collection?q=CHROME"))).toContain("4 ex. · 2 impressions");
    expect(text(render("/collection?q=lames"))).toContain("3 ex. · 2 impressions");
    // 3 copies each for Croc Chromé (VF 3) and Lames Mantis (VF 2 + VO 1): ties follow the number.
    expect(text(render("/collection?tri=quantite"))).toMatch(/Filtres C VF ×3 Croc Chromé .* C VF ×2 VO ×1 Lames Mantis .* C VO ×1 Croc Chromé/);
  });
});

describe("Collection gallery, interactions", () => {
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

  const mount = (path: string) => act(async () => root.render(<TestApp path={path} entries={entries} />));
  const click = (element: Element | null | undefined) => act(async () => (element as HTMLElement).click());
  const button = (name: string, scope: ParentNode = container) => [...scope.querySelectorAll("button")].find((b) => b.textContent?.trim() === name);
  const names = () => [...container.querySelectorAll(".gallery-card__name")].map((n) => n.textContent);
  const change = (element: HTMLInputElement | HTMLSelectElement, value: string) =>
    act(async () => {
      const prototype = element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(element, value);
      element.dispatchEvent(new Event(element instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
    });

  it("mobile: filters in a sheet with the active count, Reset and 'Voir N cartes'", async () => {
    setViewportWidth(390);
    await mount("/collection");
    expect(container.querySelector(".gallery")?.getAttribute("style")).toBeNull();
    await click(button("Filtres"));
    const sheet = container.querySelector('[role="dialog"]')!;
    expect(sheet.textContent).toContain("Voir 3 cartes");

    await click(button("Starters", sheet));
    expect(button("Voir 1 carte", sheet)).toBeTruthy();
    await click(button("VF", sheet));
    // French puts 0 in the singular.
    expect(button("Voir 0 carte", sheet)).toBeTruthy();
    expect(button("Filtres · 2")).toBeTruthy();

    await click(button("Réinitialiser", sheet));
    expect(button("Voir 3 cartes", sheet)).toBeTruthy();
    await click(button("Voir 3 cartes", sheet));
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(names()).toHaveLength(3);
  });

  it("desktop: sort, card size (remembered as a setting), and back from the card page to the same gallery", async () => {
    setViewportWidth(1280);
    await mount("/collection");
    expect(container.querySelector("aside")?.textContent).toMatch(/Langue.*Toutes langues.*VF seulement.*VO seulement.*Doublons/);
    expect(container.querySelector(".gallery")?.getAttribute("style")).toContain("minmax(180px, 1fr)");

    await change(container.querySelector<HTMLSelectElement>("#collection-sort")!, "name");
    expect(names()).toEqual(["Croc Chromé", "Croc Chromé", "Lames Mantis"]);
    await change(container.querySelector<HTMLInputElement>("#collection-name")!, "croc");
    expect(names()).toEqual(["Croc Chromé", "Croc Chromé"]);

    await change(container.querySelector<HTMLInputElement>("#collection-size")!, "240");
    expect(container.querySelector(".gallery")?.getAttribute("style")).toContain("minmax(240px, 1fr)");

    await click(container.querySelector('a[aria-label="Ouvrir Croc Chromé, Retail numéro 008"]'));
    expect(container.querySelector("h1")?.textContent).toBe("Croc Chromé");
    await click(container.querySelector('[aria-label="Retour à Collection"]') ?? button("Collection"));
    expect(names()).toEqual(["Croc Chromé", "Croc Chromé"]);
    expect(container.querySelector<HTMLInputElement>("#collection-name")!.value).toBe("croc");
    expect(container.querySelector<HTMLSelectElement>("#collection-sort")!.value).toBe("name");
    expect(container.querySelector(".gallery")?.getAttribute("style")).toContain("minmax(240px, 1fr)");
  });
});
