import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Portability rule (docs/app-spec.md §9.1). tsconfig.domain.json already
// rejects browser globals at type level; this also checks the imports.

const DOMAIN_DIR = new URL("../../src/domain/", import.meta.url);
const files = readdirSync(DOMAIN_DIR).filter((file) => file.endsWith(".ts"));

describe("src/domain is pure", () => {
  it.each(files)("%s imports only zod and other domain modules", (file) => {
    const source = readFileSync(new URL(file, DOMAIN_DIR), "utf8");
    const imports = [...source.matchAll(/from\s+["']([^"']+)["']/g)].map((match) => match[1]);
    for (const specifier of imports) {
      expect(specifier === "zod" || /^\.\/[\w.-]+$/.test(specifier!), `${file} imports ${specifier}`).toBe(true);
    }
  });

  it.each(files)("%s does not use browser APIs", (file) => {
    const source = readFileSync(new URL(file, DOMAIN_DIR), "utf8");
    expect(source).not.toMatch(/\b(window|document|navigator|localStorage|sessionStorage|indexedDB|fetch)\b/);
  });
});
