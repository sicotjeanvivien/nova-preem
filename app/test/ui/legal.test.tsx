// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { CatalogSource } from "../../src/domain/catalogLoader.ts";
import { DEFAULT_SETTINGS } from "../../src/domain/settings.ts";
import type { Services } from "../../src/platform/services.ts";
import { App } from "../../src/ui/App.tsx";
import { fakeSyncServices } from "../helpers-sync.ts";
import { MemoryCatalogStore, nodeHasher } from "../helpers.ts";
import { MemoryCollectionStore, setViewportWidth, TestApp } from "./harness.tsx";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("legal pages (docs/legal-spec.md)", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    setViewportWidth(1024);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    setViewportWidth(1024);
  });

  const render = (props: Parameters<typeof TestApp>[0]) => act(async () => root.render(<TestApp {...props} />));
  const link = (label: string, scope: ParentNode = container) => {
    const found = [...scope.querySelectorAll<HTMLElement>("a, button")].find((element) => element.textContent?.trim() === label);
    if (!found) throw new Error(`no link "${label}"`);
    return found;
  };
  const click = (element: HTMLElement) => act(async () => element.click());
  const title = () => container.querySelector(".legal__title")?.textContent;

  it("opens the four pages from Settings → About, and comes back to Settings", async () => {
    await render({ path: "/reglages" });
    const about = container.querySelector<HTMLElement>("#settings-about")!.closest("section")!;
    expect([...about.querySelectorAll("a")].map((a) => a.textContent)).toEqual(["À propos de Nova Preem", "Confidentialité", "Mentions légales", "CGU"]);
    expect(about.textContent).toContain("Version de l'app0.1.0");

    await click(link("Confidentialité", about));
    expect(title()).toBe("Politique de confidentialité");
    expect(container.querySelector("#google-drive")?.textContent).toBe("Synchronisation avec Google Drive (facultative)");
    expect(container.querySelector('a[href="mailto:awsd.contact@gmail.com"]')).not.toBeNull();
    expect(container.querySelector('a[href="https://www.cnil.fr"]')?.getAttribute("rel")).toBe("noopener");

    // From one legal page to another, back still returns to Settings.
    await click(link("Mentions légales", container.querySelector(".legal__others")!));
    expect(title()).toBe("Mentions légales");
    expect(container.textContent).toContain("Nova Preem (nova-preem.pages.dev) est édité par AWSD");
    await click(link("Réglages", container.querySelector(".legal")!));
    expect(container.querySelector("h1")?.textContent).toBe("Réglages");
  });

  it("follows the internal links of a text through the router", async () => {
    await render({ path: "/a-propos" });
    await click(link("politique de confidentialité", container.querySelector(".legal__text")!));
    expect(title()).toBe("Politique de confidentialité");
  });

  it("shows the text in the interface language, Settings as the default origin", async () => {
    await render({ path: "/cgu", language: "en" });
    expect(container.querySelector(".legal__title")?.textContent).toMatch(/^Terms/);
    expect(container.querySelector(".legal__back")?.textContent).toBe("Settings");
    expect(container.querySelector(".legal__others")?.textContent).toBe("AboutPrivacyLegal notice");
  });

  it("has the four links in the desktop sidebar, back to the screen they were opened from", async () => {
    await render({ path: "/collection" });
    const sidebar = container.querySelector<HTMLElement>(".legal-links")!;
    expect(sidebar.textContent).toBe("À proposConfidentialitéMentions légalesCGU");
    await click(link("CGU", sidebar));
    expect(title()).toBe("Conditions générales d'utilisation");
    expect(container.querySelector(".legal__back")?.textContent).toBe("Collection");
  });

  it("is full screen on mobile, with a back button naming the origin", async () => {
    setViewportWidth(390);
    await render({ path: "/reglages" });
    await click(link("CGU", container.querySelector("#settings-about")!.closest("section")!));
    expect(container.querySelector(".app--full-page")).not.toBeNull();
    expect(container.querySelector(".legal-header button")?.getAttribute("aria-label")).toBe("Retour à Réglages");
  });

  it("links the sync card, when sync is off, to the Google Drive section of the privacy policy", async () => {
    await render({ path: "/reglages", services: { sync: fakeSyncServices() } });
    const learnMore = link("En savoir plus sur les données");
    expect(learnMore.getAttribute("href")).toBe("/confidentialite#google-drive");
  });
});

describe("legal pages at first launch (spec §2)", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    window.history.replaceState(null, "", "/");
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("opens the privacy policy and the legal notice before the catalog is downloaded", async () => {
    // A download that never ends: the app stays on the first launch.
    const pending: CatalogSource = { fetchManifest: () => new Promise(() => {}), fetchCatalog: () => new Promise(() => {}) };
    const services: Services = {
      catalog: { store: new MemoryCatalogStore(), source: pending, hasher: nodeHasher },
      collection: new MemoryCollectionStore(),
      settings: { load: async () => ({ ...DEFAULT_SETTINGS, interfaceLanguage: "fr" }), update: async () => DEFAULT_SETTINGS },
      imageBaseUrl: "http://localhost/catalog/images/",
      appVersion: "0.1.0",
      sync: null,
    };
    await act(async () => root.render(<App services={services} />));
    expect(container.textContent).toContain("Téléchargement du catalogue");

    const legal = container.querySelector<HTMLElement>(".first-launch__legal")!;
    expect(legal.textContent).toBe("ConfidentialitéMentions légales");
    await act(async () => legal.querySelector<HTMLElement>('a[href="/confidentialite"]')!.click());
    expect(container.querySelector(".legal__title")?.textContent).toBe("Politique de confidentialité");
    expect(window.location.pathname).toBe("/confidentialite");

    await act(async () => container.querySelector<HTMLElement>(".legal__back")!.click());
    await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
    expect(container.textContent).toContain("Téléchargement du catalogue");
  });
});
