import { readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { Marked, type Tokens } from "marked";
import type { Plugin } from "vite";
import { MESSAGES, type MessageKey } from "../src/i18n/messages.ts";
import { LEGAL_PAGES, type LegalPageInfo, type LegalText, type LegalTexts } from "../src/ui/legalPages.ts";

// Legal pages (docs/legal-spec.md): the Markdown texts of docs/legal/ become HTML at
// build time, for the app (virtual module) and as static pages readable without JavaScript.

const VIRTUAL_ID = "virtual:legal-pages";
const RESOLVED_ID = `\0${VIRTUAL_ID}`;
const LANGUAGES = ["fr", "en"] as const;
/** Language of the static pages: the French texts prevail (spec §1). */
const STATIC_LANGUAGE = "fr";

export interface LegalConfig {
  /** Public domain, without scheme: replaces {{domain}}. */
  domain: string;
  /** Contact address: replaces {{contactEmail}}, as a mailto: link. */
  contactEmail: string;
}

/** Reads the configuration from the environment (app/.env holds the defaults). */
export function legalConfig(env: Record<string, string | undefined>): LegalConfig {
  const domain = env.VITE_SITE_DOMAIN?.trim();
  const contactEmail = env.VITE_CONTACT_EMAIL?.trim();
  if (!domain) throw new Error("VITE_SITE_DOMAIN is empty: set it in app/.env (legal pages, docs/legal-spec.md)");
  if (!contactEmail) throw new Error("VITE_CONTACT_EMAIL is empty: set it in app/.env (legal pages, docs/legal-spec.md)");
  return { domain, contactEmail };
}

/** Replaces the markers; any other {{…}} left in the text is an error. */
export function fillMarkers(markdown: string, config: LegalConfig, source: string): string {
  const filled = markdown
    .replaceAll("{{domain}}", config.domain)
    .replaceAll("{{contactEmail}}", `[${config.contactEmail}](mailto:${config.contactEmail})`);
  const left = /\{\{[^}]*\}\}/.exec(filled);
  if (left) throw new Error(`${source}: unknown marker ${left[0]}`);
  return filled;
}

const slug = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/<[^>]*>/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

const escapeAttribute = (value: string) => value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

const marked = new Marked({
  gfm: true,
  renderer: {
    heading({ tokens, depth }: Tokens.Heading) {
      const inline = this.parser.parseInline(tokens);
      // "## Title {#id}" fixes the anchor; otherwise it comes from the title (spec §3).
      const custom = /\s*\{#([\w-]+)\}\s*$/.exec(inline);
      const text = custom ? inline.slice(0, custom.index) : inline;
      const id = depth === 2 ? ` id="${custom?.[1] ?? slug(text)}"` : "";
      return `<h${depth}${id}>${text}</h${depth}>\n`;
    },
    paragraph({ tokens }: Tokens.Paragraph) {
      const inline = this.parser.parseInline(tokens);
      const updated = /^(Dernière mise à jour|Last updated)\b/.test(inline);
      return updated ? `<p class="legal__updated">${inline}</p>\n` : `<p>${inline}</p>\n`;
    },
    link({ href, title, tokens }: Tokens.Link) {
      const text = this.parser.parseInline(tokens);
      const titleAttribute = title ? ` title="${escapeAttribute(title)}"` : "";
      // External links open in a new tab; internal ones (/confidentialite…) go through the router.
      const external = /^https?:\/\//.test(href) ? ' target="_blank" rel="noopener"' : "";
      return `<a href="${escapeAttribute(href)}"${titleAttribute}${external}>${text}</a>`;
    },
  },
});

/** One text: its "# " heading becomes the title, the rest the HTML body. */
export function renderLegalText(markdown: string, config: LegalConfig, source = "legal text"): LegalText {
  const filled = fillMarkers(markdown, config, source);
  const heading = /^# (.+)\n/.exec(filled);
  if (!heading) throw new Error(`${source}: the text must start with a "# " title`);
  const html = marked.parse(filled.slice(heading[0].length), { async: false });
  return { title: heading[1]!.trim(), html };
}

export function loadLegalTexts(dir: string, config: LegalConfig): LegalTexts {
  const texts = {} as LegalTexts;
  for (const language of LANGUAGES) {
    texts[language] = {} as LegalTexts["fr"];
    for (const page of LEGAL_PAGES) {
      const file = join(dir, language, page.file);
      texts[language][page.id] = renderLegalText(readFileSync(file, "utf8"), config, file);
    }
  }
  return texts;
}

const message = (key: MessageKey) => {
  const value = MESSAGES[STATIC_LANGUAGE][key];
  if (typeof value !== "string") throw new Error(`message ${key} is not a plain string`);
  return value;
};

const escapeText = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;");

/**
 * The static page of a legal text: the app's index.html, with the page's title, description and
 * text already in #root. The app replaces it when it starts; crawlers read it as is.
 */
export function staticLegalPage(indexHtml: string, page: LegalPageInfo, text: LegalText, config: LegalConfig): string {
  const others = LEGAL_PAGES.filter((other) => other.id !== page.id)
    .map((other) => `<a href="${other.path}">${escapeText(message(other.label))}</a>`)
    .join("");
  const body = `<div class="legal-static">
<header class="legal-static__header"><a class="brand" href="/"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="M12 2l2.6 7.4L22 12l-7.4 2.6L12 22l-2.6-7.4L2 12l7.4-2.6z"/></svg><span class="brand__name">${escapeText(message("app.name"))}</span></a></header>
<article class="legal">
<h1 class="legal__title">${escapeText(text.title)}</h1>
<div class="legal__text">${text.html}</div>
<nav class="legal__others" aria-label="${escapeAttribute(message("legal.otherPages"))}">${others}</nav>
<p class="legal__footer">${escapeText(message("legal.fanMade"))} · ${escapeText(message("legal.notEndorsed"))}</p>
</article>
</div>`;
  const replace = (html: string, pattern: RegExp, replacement: string) => {
    if (!pattern.test(html)) throw new Error(`index.html: ${pattern} not found`);
    return html.replace(pattern, () => replacement);
  };
  let html = indexHtml;
  html = replace(html, /<title>[^<]*<\/title>/, `<title>${escapeText(text.title)} · Nova Preem</title>`);
  html = replace(
    html,
    /<meta name="description" content="[^"]*" \/>/,
    `<meta name="description" content="${escapeAttribute(message(page.description))}" />\n    <link rel="canonical" href="https://${config.domain}${page.path}" />`,
  );
  html = replace(html, /<div id="root"><\/div>/, `<div id="root">${body}</div>`);
  html = replace(html, /\s*<noscript>[\s\S]*?<\/noscript>/, "");
  return html;
}

/**
 * Vite plugin: serves the rendered texts as "virtual:legal-pages" and, in a production
 * build, writes dist/<route>.html for each page (Cloudflare Pages serves /cgu from cgu.html).
 */
export function legalPages(options: { dir: string; config: LegalConfig }): Plugin {
  const dir = resolve(options.dir);
  let outDir = "dist";
  let texts: LegalTexts | null = null;
  return {
    name: "nova-preem-legal-pages",
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    resolveId(id) {
      return id === VIRTUAL_ID ? RESOLVED_ID : null;
    },
    load(id) {
      if (id !== RESOLVED_ID) return null;
      for (const language of LANGUAGES) for (const page of LEGAL_PAGES) this.addWatchFile(join(dir, language, page.file));
      texts = loadLegalTexts(dir, options.config);
      return `export default ${JSON.stringify(texts)};`;
    },
    async writeBundle(_, bundle) {
      const index = bundle["index.html"];
      if (!index || index.type !== "asset" || !texts) return;
      const indexHtml = String(index.source);
      for (const page of LEGAL_PAGES) {
        await writeFile(join(outDir, `${page.path.slice(1)}.html`), staticLegalPage(indexHtml, page, texts[STATIC_LANGUAGE][page.id], options.config));
      }
    },
  };
}
