import { describe, expect, it } from "vitest";
import { fileSettingsSchema } from "../../src/domain/collectionFile.ts";
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
      collectionCardSize: 180,
      indicativePrices: true,
      offlineReadyNotified: false,
    });
    expect(settingsSchema.parse(DEFAULT_SETTINGS)).toEqual(DEFAULT_SETTINGS);
  });

  it("keeps the price setting out of the collection file and the sync (prices spec §5)", () => {
    expect(Object.keys(fileSettingsSchema.shape)).not.toContain("indicativePrices");
  });

  it("uses the interface language setting, else the device language, else French", () => {
    expect(resolveInterfaceLanguage("en", ["fr-FR"])).toBe("en");
    expect(resolveInterfaceLanguage(null, ["en-GB", "fr"])).toBe("en");
    expect(resolveInterfaceLanguage(null, ["de-DE", "fr-CA"])).toBe("fr");
    expect(resolveInterfaceLanguage(null, ["de-DE", "es"])).toBe("fr");
    expect(resolveInterfaceLanguage(null, [])).toBe("fr");
  });
});
