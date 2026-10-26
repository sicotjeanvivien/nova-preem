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
const now = new Date().toISOString();
const mantisFr = printingOf("Mantis Blades", "wnc-retail", "fr");
const mantisEn = printingOf("Mantis Blades", "wnc-retail", "en");
const chromeFr = printingOf("Chrome Fang", "wnc-retail", "fr");
const chromeStarter = printingOf("Chrome Fang", "embracing-power-starter-retail", "en");
const entries = [at(now, mantisFr.id, 2), at(now, mantisEn.id, 1), at("2026-01-02T10:00:00Z", chromeFr.id, 3), at(now, chromeStarter.id, 1)];

describe("Collection, mobile layout (server rendering)", () => {
  const render = (path: string) => text(renderToString(<TestApp path={path} entries={entries} />));

  it("lists one line per owned variant, with its quantities per language and the summary", () => {
    const content = render("/collection");
    expect(content).toContain("7 ex. · 4 impressions");
    expect(content).toMatch(/Lames Mantis.*Retail #025 · Commune.*Ajoutée aujourd’hui.*VF 2 VO 1/);
    expect(content).toMatch(/Croc Chromé.*Embracing Power — Retail #002/);
    expect(content).toMatch(/Toutes langues VF VO Doublons/);
    expect(content).toMatch(/Set Tirage Rareté Type Couleur/);
    expect(content).toMatch(/Trier Récents Numéro Nom Quantité/);
  });

  it("filters by language and shows the surplus of duplicates, per printing", () => {
    const vf = render("/collection?langue=fr");
    expect(vf).toContain("5 ex. · 2 impressions");
    expect(vf).not.toContain("VO 1");

    const duplicates = render("/collection?doublons=1");
    expect(duplicates).toContain("Au-delà de 1 exemplaire par impression");
    expect(duplicates).toMatch(/Lames Mantis.*\+1 en trop/);
    expect(duplicates).toMatch(/Croc Chromé.*\+2 en trop/);
    expect(duplicates).toContain("6 ex. · 3 impressions");
  });

  it("filters by release group from the URL", () => {
    expect(render("/collection?tirage=starter")).toContain("1 ex. · 1 impression");
    expect(render("/collection?tirage=starter&langue=fr")).toContain("Aucune carte possédée pour ces filtres.");
  });
});

describe("Collection, interactions", () => {
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
  const buttonNamed = (name: string) => [...container.querySelectorAll("button")].find((b) => b.textContent?.trim().startsWith(name));

  it("filters with the mobile menus", async () => {
    setViewportWidth(390);
    await mount("/collection");
    await click(buttonNamed("Tirage"));
    const starters = [...container.querySelectorAll("label")].find((label) => label.textContent === "Starters")!;
    await click(starters.querySelector("input"));
    expect(container.textContent).toContain("1 ex. · 1 impression");
    expect(buttonNamed("Tirage (1)")).toBeTruthy();
  });

  it("sorts the desktop table by column, a second click reverses, and a row opens the card page and comes back", async () => {
    setViewportWidth(1280);
    await mount("/collection");
    const names = () => [...container.querySelectorAll(".collection-table__name")].map((n) => n.textContent);
    expect(container.querySelector("table")).toBeTruthy();

    await click(buttonNamed("Carte"));
    expect(names()).toEqual(["Croc Chromé", "Croc Chromé", "Lames Mantis"]);
    expect(container.querySelector('th[aria-sort="ascending"]')?.textContent).toContain("Carte");
    await click(buttonNamed("Carte"));
    expect(names()[0]).toBe("Lames Mantis");
    expect(container.querySelector('th[aria-sort="descending"]')).toBeTruthy();

    await click(container.querySelector('a[href="/cartes/mantis-blades"]'));
    const back = container.querySelector('[aria-label="Retour à Collection"]') ?? buttonNamed("Collection");
    expect(container.querySelector("h1")?.textContent).toBe("Lames Mantis");
    await click(back);
    expect(names()[0]).toBe("Lames Mantis");
    expect(container.querySelector('th[aria-sort="descending"]')?.textContent).toContain("Carte");
  });
});
