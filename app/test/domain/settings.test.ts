import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, resolveInterfaceLanguage, settingsSchema } from "../../src/domain/settings.ts";

describe("settings", () => {
  it("has the defaults of the spec (§7)", () => {
    expect(DEFAULT_SETTINGS).toEqual({
      entryReleaseId: "wnc-retail",
      entryLanguage: "fr",
      completionGroups: ["main", "starter"],
      duplicateThreshold: 1,
      cardNameLanguage: "entry",
      interfaceLanguage: null,
      downloadAllImages: false,
    });
    expect(settingsSchema.parse(DEFAULT_SETTINGS)).toEqual(DEFAULT_SETTINGS);
  });

  it("uses the interface language setting, else the device language, else French", () => {
    expect(resolveInterfaceLanguage("en", ["fr-FR"])).toBe("en");
    expect(resolveInterfaceLanguage(null, ["en-GB", "fr"])).toBe("en");
    expect(resolveInterfaceLanguage(null, ["de-DE", "fr-CA"])).toBe("fr");
    expect(resolveInterfaceLanguage(null, ["de-DE", "es"])).toBe("fr");
    expect(resolveInterfaceLanguage(null, [])).toBe("fr");
  });
});
