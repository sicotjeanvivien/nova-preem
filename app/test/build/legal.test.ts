import { describe, expect, it } from "vitest";
import { fillMarkers, legalConfig, loadLegalTexts, renderLegalText, staticLegalPage } from "../../build/legal.ts";
import { legalPage } from "../../src/ui/legalPages.ts";

const config = { domain: "example.test", contactEmail: "contact@example.test" };

describe("legal texts (docs/legal-spec.md)", () => {
  it("replaces the markers, the address as a mailto: link, and refuses an unknown one", () => {
    expect(fillMarkers("{{domain}} · {{contactEmail}}", config, "t")).toBe("example.test · [contact@example.test](mailto:contact@example.test)");
    expect(() => fillMarkers("{{phone}}", config, "t.md")).toThrow("t.md: unknown marker {{phone}}");
  });

  it("refuses an empty configuration", () => {
    expect(() => legalConfig({ VITE_SITE_DOMAIN: "a.test", VITE_CONTACT_EMAIL: " " })).toThrow("VITE_CONTACT_EMAIL");
    expect(legalConfig({ VITE_SITE_DOMAIN: "a.test", VITE_CONTACT_EMAIL: "b@a.test" })).toEqual({ domain: "a.test", contactEmail: "b@a.test" });
  });

  it("takes the title from the heading and anchors the level-2 titles", () => {
    const text = renderLegalText("# Politique\n\nDernière mise à jour : hier\n\n## Qui est là\n\n## Google Drive (facultatif) {#google-drive}\n", config);
    expect(text.title).toBe("Politique");
    expect(text.html).not.toContain("<h1");
    expect(text.html).toContain('<p class="legal__updated">Dernière mise à jour : hier</p>');
    expect(text.html).toContain('<h2 id="qui-est-la">Qui est là</h2>');
    expect(text.html).toContain('<h2 id="google-drive">Google Drive (facultatif)</h2>');
  });

  it("opens external links in a new tab and leaves internal and mailto: links alone", () => {
    const { html } = renderLegalText("# T\n\n[a](https://cnil.fr) [b](/cgu) {{contactEmail}} `drive.file` **x**", config);
    expect(html).toContain('<a href="https://cnil.fr" target="_blank" rel="noopener">a</a>');
    expect(html).toContain('<a href="/cgu">b</a>');
    expect(html).toContain('<a href="mailto:contact@example.test">contact@example.test</a>');
    expect(html).toContain("<code>drive.file</code>");
    expect(html).toContain("<strong>x</strong>");
  });

  it("renders the real texts, in both languages, without a marker left", () => {
    const texts = loadLegalTexts("../docs/legal", config);
    for (const language of ["fr", "en"] as const) {
      for (const text of Object.values(texts[language])) expect(text.html).not.toMatch(/\{\{|\{#/);
      expect(texts[language].privacy.html).toContain('id="google-drive"');
      expect(texts[language].legal.html).toContain("example.test");
    }
    expect(texts.fr.privacy.title).toBe("Politique de confidentialité");
  });

  it("writes a static page from index.html: title, description, canonical address, text, no <noscript>", () => {
    const index = `<html lang="fr"><head><meta name="description" content="App" />\n<title>Nova Preem</title></head><body>\n<div id="root"></div>\n<noscript>JS</noscript><script src="/a.js"></script></body></html>`;
    const html = staticLegalPage(index, legalPage("privacy"), { title: "Politique de confidentialité", html: "<p>Texte</p>" }, config);
    expect(html).toContain("<title>Politique de confidentialité · Nova Preem</title>");
    expect(html).toContain('<link rel="canonical" href="https://example.test/confidentialite" />');
    expect(html).toMatch(/<meta name="description" content="Politique de confidentialité de Nova Preem[^"]*" \/>/);
    expect(html).toContain('<h1 class="legal__title">Politique de confidentialité</h1>');
    expect(html).toContain("<p>Texte</p>");
    expect(html).toContain('<a href="/mentions-legales">Mentions légales</a>');
    expect(html).not.toContain("noscript");
    expect(html).toContain('<script src="/a.js"></script>');
  });
});
