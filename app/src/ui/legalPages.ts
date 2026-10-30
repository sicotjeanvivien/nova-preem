import type { MessageKey } from "../i18n/messages.ts";

// The four legal pages (docs/legal-spec.md §1). Their texts are docs/legal/{fr,en}/<file>,
// turned into HTML at build time (build/legal.ts) and imported from "virtual:legal-pages".

export type LegalPageId = "about" | "privacy" | "legal" | "terms";

export interface LegalPageInfo {
  id: LegalPageId;
  path: string;
  file: string;
  /** Short label: sidebar, footer of the legal pages. */
  label: MessageKey;
  /** Label of the row in Settings → About. */
  settingsLabel: MessageKey;
  /** <meta name="description">. */
  description: MessageKey;
}

export const LEGAL_PAGES: readonly LegalPageInfo[] = [
  { id: "about", path: "/a-propos", file: "about.md", label: "legal.link.about", settingsLabel: "legal.settings.about", description: "legal.description.about" },
  { id: "privacy", path: "/confidentialite", file: "privacy.md", label: "legal.link.privacy", settingsLabel: "legal.link.privacy", description: "legal.description.privacy" },
  { id: "legal", path: "/mentions-legales", file: "legal-notice.md", label: "legal.link.legal", settingsLabel: "legal.link.legal", description: "legal.description.legal" },
  { id: "terms", path: "/cgu", file: "terms.md", label: "legal.link.terms", settingsLabel: "legal.link.terms", description: "legal.description.terms" },
];

export const legalPage = (id: LegalPageId) => LEGAL_PAGES.find((page) => page.id === id)!;

/** A page as the build produces it: its title (the text's "# " heading) and its body in HTML. */
export interface LegalText {
  title: string;
  html: string;
}

export type LegalTexts = Record<"fr" | "en", Record<LegalPageId, LegalText>>;
