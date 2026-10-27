// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../../src/domain/settings.ts";
import { MemoryCatalogStore } from "../helpers.ts";
import { printingOf } from "../helpers-catalog.ts";
import { newerCatalogSource } from "../helpers-update.ts";
import { entry, MemoryCollectionStore, setViewportWidth, TestApp, text } from "./harness.tsx";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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
  Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
});

const mount = (props: Parameters<typeof TestApp>[0]) => act(async () => root.render(<TestApp {...props} />));
const settle = () => act(async () => {});
const button = (name: string, scope: ParentNode = container) => [...scope.querySelectorAll("button")].find((b) => b.textContent === name)!;
const dialog = () => container.querySelector('[role="dialog"]');

describe("catalog update (States 3)", () => {
  it("offers the new catalog at launch, summarized, and applies it without touching the collection", async () => {
    const catalogStore = new MemoryCatalogStore();
    const store = new MemoryCollectionStore();
    const johnny = printingOf("Johnny Silverhand — Rocking Renegade", "wnc-retail", "fr").id;
    await mount({ path: "/sets", catalogSource: newerCatalogSource(), catalogStore, store, entries: [entry(johnny, 2)], checkAtLaunch: true });
    await settle();

    expect(dialog()?.textContent).toMatch(/Catalogue mis à jour.*→ v2026-11-02\.1/);
    expect(dialog()?.textContent).toContain("1 nouvelle carte");
    expect(dialog()?.textContent).toContain("1 nouvelle impression, dont Set 2 Preview");
    expect(dialog()?.textContent).toContain("1 texte corrigé (errata)");
    expect(dialog()?.textContent).toContain("Votre collection n'est pas modifiée");

    await act(async () => button("Mettre à jour", dialog()!).click());
    await settle();
    expect(dialog()).toBeNull();
    expect(catalogStore.saves).toBe(1);
    expect(catalogStore.stored?.manifest.version).toBe("2026-11-02.1");
    expect(container.textContent).toContain("152 cartes");
    expect(store.writes).toEqual([]);
  });

  it("does nothing when the user chooses later", async () => {
    const catalogStore = new MemoryCatalogStore();
    await mount({ path: "/sets", catalogSource: newerCatalogSource(), catalogStore, checkAtLaunch: true });
    await settle();
    await act(async () => button("Plus tard", dialog()!).click());
    expect(dialog()).toBeNull();
    expect(catalogStore.saves).toBe(0);
    expect(container.textContent).toContain("151 cartes");
  });

  it("opens from the settings' Check button", async () => {
    await mount({ path: "/reglages", catalogSource: newerCatalogSource() });
    await act(async () => button("Vérifier").click());
    await settle();
    expect(container.textContent).toContain("Nouvelle version disponible : v2026-11-02.1.");
    expect(dialog()?.textContent).toContain("Catalogue mis à jour");
  });

  it("tells when the catalog is up to date", async () => {
    await mount({ path: "/reglages" });
    await act(async () => button("Vérifier").click());
    await settle();
    expect(container.textContent).toContain("Le catalogue est à jour.");
    expect(dialog()).toBeNull();
  });
});

describe("offline (States 2)", () => {
  it("shows the offline banner, the entries keep working", async () => {
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
    setViewportWidth(390);
    const store = new MemoryCollectionStore();
    await mount({ path: "/sets/wnc/wnc-retail", store });
    expect(container.querySelector(".offline-banner")?.textContent).toBe("Hors-ligne. Vos saisies sont enregistrées sur l'appareil.");
    await act(async () => container.querySelector<HTMLButtonElement>(".tile__plus")!.click());
    await settle();
    expect(store.writes).toHaveLength(1);
  });

  it("says 'in this browser' on desktop, with the offline status in the sidebar", async () => {
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
    setViewportWidth(1280);
    await mount({ path: "/sets" });
    expect(container.querySelector(".offline-banner")?.textContent).toBe("Hors-ligne. Vos saisies sont enregistrées dans ce navigateur.");
    expect(container.querySelector(".nav__footer")?.textContent).toContain("Hors-ligne");
  });
});

describe("empty collection (States 4)", () => {
  it("invites to enter cards in the entry release and language, or to import", () => {
    const content = text(renderToString(<TestApp path="/collection" />));
    expect(content).toContain("Votre classeur est vide");
    expect(content).toContain("elle est ajoutée en Retail VF");
    expect(content).toMatch(/Saisir mes premières cartes Importer une sauvegarde/);
  });

  it("opens the cards of the entry release from the first button, and has its desktop wording", async () => {
    setViewportWidth(1280);
    await mount({ path: "/collection" });
    expect(container.querySelector("h1")?.textContent).toBe("Votre collection est vide");
    await act(async () => button("Ouvrir les sets").click());
    expect(container.querySelector("h1")?.textContent).toBe("Retail");
  });
});

describe("interface in English", () => {
  const FRENCH = /\b(Toutes|Réglages|Recherche|cartes|impressions?|Retour|Manquantes?|Possédées?|Tirage|Rareté|Saisie|Complétion|Données|Hors-ligne|exemplaires?|Langue|Ajouter|Afficher|variantes?|Télécharger|Vérifier|Exporter|Importer|Filtrer|Trier|Quantité|Couleur|tous|uniquement|Mode ajout|Doublons?)\b/;
  const english = { ...DEFAULT_SETTINGS, interfaceLanguage: "en" as const, cardNameLanguage: "en" as const, entryLanguage: "en" };
  const owned = [entry(printingOf("Chrome Fang", "wnc-retail", "en").id, 2)];

  it.each([
    "/sets",
    "/sets/wnc",
    "/sets/wnc/wnc-retail",
    "/sets/wnc/edgerunner-open-s1?filtre=manquantes",
    "/cartes/chrome-fang",
    "/collection",
    "/collection?doublons=1",
    "/recherche?q=chrome",
    "/stats",
    "/stats?mode=master",
    "/reglages",
  ])("%s has no French interface text", (path) => {
    const content = text(renderToString(<TestApp path={path} settings={english} entries={owned} />));
    expect(content).not.toMatch(FRENCH);
  });

  it("the empty collection too", () => {
    expect(text(renderToString(<TestApp path="/collection" settings={english} />))).not.toMatch(FRENCH);
  });
});
