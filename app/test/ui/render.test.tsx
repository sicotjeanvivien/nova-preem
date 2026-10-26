import { renderToString } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router";
import { describe, expect, it } from "vitest";
import { catalogSchema, manifestSchema } from "../../src/domain/catalog.ts";
import { DEFAULT_SETTINGS } from "../../src/domain/settings.ts";
import { I18nProvider } from "../../src/i18n/i18n.tsx";
import type { Services } from "../../src/platform/services.ts";
import { AppContext } from "../../src/ui/AppContext.tsx";
import { AppLayout } from "../../src/ui/AppLayout.tsx";
import { FirstLaunch } from "../../src/ui/FirstLaunch.tsx";
import { SettingsScreen } from "../../src/ui/screens/EmptyScreen.tsx";
import { SetsScreen } from "../../src/ui/screens/SetsScreen.tsx";
import { realCatalogText, realManifest } from "../helpers.ts";

// Smoke tests: the screens render with the real catalog, without a browser.

const context = {
  services: {} as Services,
  catalog: { manifest: manifestSchema.parse(realManifest), catalog: catalogSchema.parse(JSON.parse(realCatalogText)) },
  settings: DEFAULT_SETTINGS,
};

function renderAt(path: string, language: "fr" | "en" = "fr") {
  return renderToString(
    <I18nProvider language={language}>
      <AppContext.Provider value={context}>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/" element={<AppLayout />}>
              <Route path="sets" element={<SetsScreen />} />
              <Route path="reglages" element={<SettingsScreen />} />
            </Route>
          </Routes>
        </MemoryRouter>
      </AppContext.Provider>
    </I18nProvider>,
  );
}

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ");

describe("app shell", () => {
  it("shows the five tabs in order, the current one marked", () => {
    const html = renderAt("/sets");
    const links = [...html.matchAll(/<a [^>]*href="([^"]+)"[^>]*>/g)].map((m) => m[0]);
    expect(links.map((l) => /href="([^"]+)"/.exec(l)![1])).toEqual(["/sets", "/collection", "/recherche", "/stats", "/reglages"]);
    expect(links[0]).toContain('aria-current="page"');
    expect(text(html)).toMatch(/Sets Collection Recherche Stats Réglages/);
    expect(html).toContain('aria-label="Navigation principale"');
    expect(text(html)).toContain("Fan-made, non officiel");
  });

  it("shows the set with the number of cards of the real catalog", () => {
    const content = text(renderAt("/sets"));
    expect(content).toContain("Welcome to Night City");
    expect(content).toContain("17 tirages · 151 cartes · VO et VF");
  });

  it("is translated into English", () => {
    const content = text(renderAt("/sets", "en"));
    expect(content).toContain("17 releases · 151 cards · EN and FR");
    expect(content).toMatch(/Sets Collection Search Stats Settings/);
  });

  it("shows the legal notice at the bottom of the settings", () => {
    expect(text(renderAt("/reglages"))).toContain("Outil de fan, non officiel");
  });
});

describe("first launch", () => {
  const render = (props: Parameters<typeof FirstLaunch>[0]) =>
    renderToString(
      <I18nProvider language="fr">
        <FirstLaunch {...props} />
      </I18nProvider>,
    );

  it("shows the download progress, rounded down", () => {
    const html = render({ progress: 0.629, error: null, onRetry: () => {} });
    expect(text(html)).toContain("Téléchargement du catalogue");
    expect(html).toMatch(/62\s?%/);
    expect(html).toContain('aria-valuenow="62"');
    expect(html).not.toContain("Navigation principale");
  });

  it("offers to try again after a failure", () => {
    const html = render({ progress: 0, error: "network", onRetry: () => {} });
    expect(text(html)).toContain("Impossible de télécharger le catalogue");
    expect(text(html)).toContain("Réessayer");
  });
});
