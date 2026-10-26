// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { CollectionEntry } from "../../src/domain/collection.ts";
import { buildCollectionFile, serializeCollectionFile } from "../../src/domain/collectionFile.ts";
import { DEFAULT_SETTINGS } from "../../src/domain/settings.ts";
import { printingOf } from "../helpers-catalog.ts";
import { MemoryCollectionStore, TestApp, text } from "./harness.tsx";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("Settings, server rendering", () => {
  const content = text(renderToString(<TestApp path="/reglages" />));

  it("has the four sections of the spec with the default values", () => {
    expect(content).toMatch(/Saisie Tirage par défaut Retail Beta The Heist — Retail/);
    expect(content).toContain("« Retail · VF »");
    expect(content).toMatch(/Complétion Set principal Retail, Beta Starters The Heist, Embracing Power Decks démo Merc, Arasaka Promos Pre-Release, Box Toppers, Edgerunner Open S1…/);
    expect(content).toContain("Doublon au-delà de 1 ex. par impression");
    expect(content).toMatch(/Affichage Noms des cartes Langue de saisie Toujours VF Toujours VO Langue de l'interface Français English/);
    expect(content).toMatch(/Données Catalogue des cartes v2026-10-26\.\d+ · 151 cartes · hors-ligne Vérifier Exporter Importer CSV/);
    expect(content).toMatch(/Synchronisation Google Drive Après le MVP Bientôt/);
    expect(content).toContain("Nova Preem est un outil de fan, non officiel.");
  });
});

describe("Settings, interactions", () => {
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
  });

  const byLabel = (label: string) => container.querySelector<HTMLElement>(`[aria-label="${label}"]`)!;
  const button = (name: string) => [...container.querySelectorAll("button")].find((b) => b.textContent === name)!;
  const click = (element: HTMLElement) => act(async () => element.click());

  it("applies the settings at once", async () => {
    await act(async () => root.render(<TestApp path="/reglages" />));
    const demo = byLabel("Compter Decks démo dans la complétion");
    expect(demo.getAttribute("aria-checked")).toBe("false");
    await click(demo);
    expect(demo.getAttribute("aria-checked")).toBe("true");

    await click(byLabel("Seuil de doublon plus un"));
    expect(container.textContent).toContain("Doublon au-delà de 2 ex. par impression");

    await click(button("Beta"));
    expect(container.textContent).toContain("« Beta · VF »");

    await click(button("English"));
    expect(container.querySelector("h1")?.textContent).toBe("Settings");
  });

  it("keeps at least one counted group", async () => {
    await act(async () => root.render(<TestApp path="/reglages" settings={{ ...DEFAULT_SETTINGS, completionGroups: ["main"] }} />));
    const main = byLabel("Compter Set principal dans la complétion");
    await click(main);
    expect(main.getAttribute("aria-checked")).toBe("true");
  });

  it("exports, empties and imports back the same collection (step 7 criterion)", async () => {
    const at = "2026-10-20T10:00:00.000Z";
    const original: CollectionEntry[] = [
      { printingId: printingOf("Johnny Silverhand — Rocking Renegade", "wnc-retail", "fr").id, quantity: 2, firstAddedAt: at, lastAddedAt: "2026-10-26T10:00:00.000Z" },
      { printingId: printingOf("Chrome Fang", "wnc-retail", "en").id, quantity: 1, firstAddedAt: at, lastAddedAt: at },
      { printingId: "printing-of-a-future-catalog", quantity: 1, firstAddedAt: at, lastAddedAt: at },
    ];
    const exported = serializeCollectionFile(
      buildCollectionFile({ entries: original, settings: DEFAULT_SETTINGS, appVersion: "0.1.0", catalogVersion: "x", now: "2026-10-26T12:00:00.000Z" }),
    );
    const empty = new MemoryCollectionStore();
    await act(async () => root.render(<TestApp path="/reglages" store={empty} />));

    const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
    const file = new File([exported], "nova-preem-collection-2026-10-26.json", { type: "application/json" });
    Object.defineProperty(input, "files", { value: [file], configurable: true });
    await act(async () => input.dispatchEvent(new Event("change", { bubbles: true })));
    await act(async () => {});

    const dialog = container.querySelector('[role="dialog"]')!;
    expect(dialog.textContent).toContain("3 impressions ajoutées");
    expect(dialog.textContent).toContain("1 impression inconnue du catalogue actuel (conservées)");
    await click([...dialog.querySelectorAll("label")].find((l) => l.textContent?.startsWith("Remplacer"))!.querySelector("input")!);
    await click([...dialog.querySelectorAll("button")].find((b) => b.textContent === "Importer")!);
    await act(async () => {});

    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(container.textContent).toContain("Import terminé : 3 impressions dans la collection.");
    expect(await empty.exportAll()).toEqual([...original].sort((a, b) => (a.printingId < b.printingId ? -1 : 1)));
  });

  it("refuses a file that is not a backup, with a clear message", async () => {
    await act(async () => root.render(<TestApp path="/reglages" />));
    const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
    Object.defineProperty(input, "files", { value: [new File(['{"format":"other"}'], "x.json")], configurable: true });
    await act(async () => input.dispatchEvent(new Event("change", { bubbles: true })));
    await act(async () => {});
    expect(container.textContent).toContain("Ce fichier n'est pas une sauvegarde Nova Preem.");
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });
});
