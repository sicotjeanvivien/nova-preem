// The legal texts, rendered at build time by build/legal.ts (same shape as LegalTexts in ui/legalPages.ts:
// an ambient module cannot import it).
declare module "virtual:legal-pages" {
  const texts: Record<"fr" | "en", Record<"about" | "privacy" | "legal" | "terms", { title: string; html: string }>>;
  export default texts;
}
