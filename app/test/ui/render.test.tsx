import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { I18nProvider } from "../../src/i18n/i18n.tsx";
import { FirstLaunch } from "../../src/ui/FirstLaunch.tsx";
import { printingOf } from "../helpers-catalog.ts";
import { entry, TestApp, text } from "./harness.tsx";

// Server-side rendering of the screens with the real catalog: no browser needed.

const render = (props: Parameters<typeof TestApp>[0]) => renderToString(<TestApp {...props} />);
const count = (html: string, className: string) => html.split(`class="${className}`).length - 1;

describe("app shell", () => {
  it("shows the five tabs in order, the current one marked", () => {
    const html = render({ path: "/sets" });
    const links = [...html.matchAll(/<a [^>]*class="nav__link[^"]*"[^>]*>/g)].map((m) => m[0]);
    expect(links.map((l) => /href="([^"]+)"/.exec(l)![1])).toEqual(["/sets", "/collection", "/recherche", "/stats", "/reglages"]);
    expect(links[0]).toContain('aria-current="page"');
    expect(text(html)).toMatch(/Sets Collection Recherche Stats Réglages/);
    expect(text(html)).toContain("Fan-made, non officiel");
  });

  it("shows the legal notice at the bottom of the settings", () => {
    expect(text(render({ path: "/reglages" }))).toContain("Outil de fan, non officiel");
  });
});

describe("set list", () => {
  it("shows the set, its real counts, its progress and its tabs", () => {
    const owned = printingOf("Johnny Silverhand — Rocking Renegade", "wnc-retail", "fr");
    const content = text(render({ path: "/sets", entries: [entry(owned.id, 2)] }));
    expect(content).toContain("Welcome to Night City");
    expect(content).toContain("17 tirages · 151 cartes · VO et VF");
    expect(content).toContain("Set jouable 1 / 150 cartes");
    expect(content).toContain("Master set 1 / 588");
    expect(content).toContain("Retail en VF 1 / 168");
    expect(content).toMatch(/Retail Beta Starters Démos Promos/);
    expect(content).toContain("Voir les cartes");
  });

  it("is translated into English", () => {
    const content = text(render({ path: "/sets", language: "en" }));
    expect(content).toContain("17 releases · 151 cards · EN and FR");
    expect(content).toContain("Retail in FR");
  });
});

describe("set page", () => {
  it("opens on Retail with the VF/VO selector and one tile per variant", () => {
    const html = render({ path: "/sets/wnc" });
    expect(text(html)).toMatch(/Retail 0\/168 Beta 0\/172 Starters 0\/80 Démos 0\/29 Promos 0\/134/);
    expect(html).toMatch(/aria-selected="true"[^>]*>Retail/);
    expect(html).toContain('aria-label="Langue saisie"');
    expect(count(html, "tile ")).toBe(168);
    expect(html).toContain("Ajouter un exemplaire VF : Johnny Silverhand — Rock&#x27;n&#x27;Rebelle, numéro 003");
  });

  it("shows Beta in VO only, with its exclusive Iconics", () => {
    const html = render({ path: "/sets/wnc?tirage=wnc-beta" });
    expect(text(html)).toContain("VO uniquement");
    expect(html).not.toContain('aria-label="Langue saisie"');
    expect(count(html, "tile ")).toBe(172);
    expect(text(html)).toContain("β168");
  });

  it("offers a sub-filter in group tabs, and names the release on each tile", () => {
    const all = render({ path: "/sets/wnc?tirage=promo" });
    expect(text(all)).toMatch(/Toutes Pre-Release — Retail Pre-Release — Beta Box Toppers — Retail/);
    expect(count(all, "tile ")).toBe(134);
    expect(count(all, "tile__release")).toBe(134);

    const eo = render({ path: "/sets/wnc?tirage=edgerunner-open-s1" });
    expect(eo).toMatch(/aria-pressed="true"[^>]*>Edgerunner Open S1/);
    expect(count(eo, "tile ")).toBe(51);
    expect(count(eo, "tile__release")).toBe(0);
  });

  it("filters the missing cards in the entry language and offers to copy them", () => {
    const johnny = printingOf("Johnny Silverhand — Rocking Renegade", "wnc-retail", "fr");
    const chrome = printingOf("Chrome Fang", "wnc-retail", "en");
    const html = render({ path: "/sets/wnc?filtre=manquantes", entries: [entry(johnny.id, 1), entry(chrome.id, 1)] });
    expect(count(html, "tile ")).toBe(167);
    expect(text(html)).toContain("167 variantes manquantes dans ce tirage");
    expect(text(html)).toContain("Copier la liste");
    // Owned in VO only: still missing in VF, with its VO badge.
    expect(text(html)).toMatch(/Croc Chromé\s+VO 1/);
  });

  it("keeps the language from the URL", () => {
    const html = render({ path: "/sets/wnc?langue=en" });
    expect(html).toMatch(/aria-pressed="true"[^>]*>VO/);
    expect(html).toContain("Ajouter un exemplaire VO : Johnny Silverhand — Rocking Renegade, numéro 003");
  });
});

describe("first launch", () => {
  const renderLaunch = (props: Parameters<typeof FirstLaunch>[0]) =>
    renderToString(
      <I18nProvider language="fr">
        <FirstLaunch {...props} />
      </I18nProvider>,
    );

  it("shows the download progress, rounded down", () => {
    const html = renderLaunch({ progress: 0.629, error: null, onRetry: () => {} });
    expect(text(html)).toContain("Téléchargement du catalogue");
    expect(html).toMatch(/62\s?%/);
    expect(html).toContain('aria-valuenow="62"');
    expect(html).not.toContain("Navigation principale");
  });

  it("offers to try again after a failure", () => {
    const html = renderLaunch({ progress: 0, error: "network", onRetry: () => {} });
    expect(text(html)).toContain("Impossible de télécharger le catalogue");
    expect(text(html)).toContain("Réessayer");
  });
});
