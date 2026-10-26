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
    expect(text(render({ path: "/reglages" }))).toContain("outil de fan, non officiel");
  });
});

describe("Sets, level 1: set list", () => {
  it("shows a tile per set with the cards owned, its releases and a name filter", () => {
    const owned = printingOf("Johnny Silverhand — Rocking Renegade", "wnc-retail", "fr");
    const content = text(render({ path: "/sets", entries: [entry(owned.id, 2)] }));
    expect(content).toMatch(/Sets 1 set/);
    expect(content).toContain("Welcome to Night City 1 / 151 cartes · 17 tirages");
    expect(render({ path: "/sets" })).toContain('placeholder="Filtrer par nom"');
  });

  it("is translated into English", () => {
    expect(text(render({ path: "/sets", language: "en" }))).toContain("Welcome to Night City 0 / 151 cards · 17 releases");
  });
});

describe("Sets, level 2: releases of a set", () => {
  it("shows one tile per release, grouped by type, with progress and languages", () => {
    const owned = printingOf("Chrome Fang", "embracing-power-starter-retail", "en");
    const content = text(render({ path: "/sets/wnc", entries: [entry(owned.id, 1)] }));
    expect(content).toMatch(/Sets Welcome to Night City 17 tirages/);
    expect(content).toMatch(/Set principal Principal Welcome to Night City Retail 0 \/ 168 VO VF 0 % Principal Welcome to Night City Beta 0 \/ 172 VO 0 %/);
    expect(content).toMatch(/Starters Starter Welcome to Night City The Heist — Retail 0 \/ 20/);
    expect(content).toContain("Embracing Power — Retail 1 / 20 VO 5 %");
    expect(content).toMatch(/Decks démo .*Merc 0 \/ 15 .*Arasaka 0 \/ 14/);
    expect(content).toMatch(/Promos .*Pre-Release — Retail .*Judge Promos 0 \/ 3 VO 0 %/);
  });

  it("links each tile to the cards of its release", () => {
    const html = render({ path: "/sets/wnc" });
    expect(html).toContain('href="/sets/wnc/wnc-retail"');
    expect(html).toContain('href="/sets/wnc/edgerunner-open-s1"');
  });
});

describe("Sets, level 3: cards of a release", () => {
  it("shows Retail with the VF/VO selector, one tile per variant with − quantity +", () => {
    const html = render({ path: "/sets/wnc/wnc-retail" });
    expect(text(html)).toMatch(/Welcome to Night City Retail 0 \/ 168 variantes possédées/);
    expect(text(html)).toMatch(/Quantités en VF VO Toutes Manquantes Possédées Doublons/);
    expect(count(html, "tile ")).toBe(168);
    expect(html).toContain('aria-label="Ouvrir la carte Johnny Silverhand — Rock&#x27;n&#x27;Rebelle, numéro 003"');
    expect(html).toContain('aria-label="Ajouter un exemplaire VF : Johnny Silverhand — Rock&#x27;n&#x27;Rebelle"');
    expect(html).toMatch(/aria-label="Retirer un exemplaire VF : Johnny Silverhand — Rock&#x27;n&#x27;Rebelle" disabled=""/);
  });

  it("shows Beta without language selector (VO only), with its exclusive Iconics", () => {
    const html = render({ path: "/sets/wnc/wnc-beta" });
    expect(text(html)).not.toContain("Quantités en");
    expect(count(html, "tile ")).toBe(172);
    expect(text(html)).toContain("β168");
    expect(html).toContain('aria-label="Ajouter un exemplaire VO : Johnny Silverhand — Rocking Renegade"');
  });

  it("filters the missing cards in the language of the quantities and offers to copy them", () => {
    const johnny = printingOf("Johnny Silverhand — Rocking Renegade", "wnc-retail", "fr");
    const chrome = printingOf("Chrome Fang", "wnc-retail", "en");
    const html = render({ path: "/sets/wnc/wnc-retail?filtre=manquantes", entries: [entry(johnny.id, 1), entry(chrome.id, 1)] });
    expect(count(html, "tile ")).toBe(167);
    expect(text(html)).toContain("167 variantes manquantes Copier la liste");
    // Owned in VO only: missing in VF, with the VO badge on the image.
    expect(text(html)).toMatch(/008 C VO 1 Croc Chromé − 0 \+/);
  });

  it("keeps the language from the URL", () => {
    expect(render({ path: "/sets/wnc/wnc-retail?langue=en" })).toMatch(/aria-pressed="true"[^>]*>VO/);
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
