import { z } from "zod";
import { releaseGroupSchema } from "./catalog.ts";

// User settings (docs/app-spec.md §7).

export const interfaceLanguages = ["fr", "en"] as const;
export type InterfaceLanguage = (typeof interfaceLanguages)[number];

export const settingsSchema = z.object({
  entryReleaseId: z.string(),
  entryLanguage: z.string(),
  completionGroups: z.array(releaseGroupSchema),
  duplicateThreshold: z.number().int().min(1).max(9),
  /** "entry": card names follow the VF/VO selector. */
  cardNameLanguage: z.enum(["entry", "fr", "en"]),
  /** null: follow the browser language. */
  interfaceLanguage: z.enum(interfaceLanguages).nullable(),
  downloadAllImages: z.boolean(),
});

export type Settings = z.infer<typeof settingsSchema>;

export const DEFAULT_SETTINGS: Settings = {
  entryReleaseId: "wnc-retail",
  entryLanguage: "fr",
  completionGroups: ["main", "starter"],
  duplicateThreshold: 1,
  cardNameLanguage: "entry",
  interfaceLanguage: null,
  downloadAllImages: false,
};

/**
 * Interface language: the setting if set, otherwise the first supported
 * preferred language of the device, otherwise French (spec §7).
 */
export function resolveInterfaceLanguage(setting: InterfaceLanguage | null, preferredLanguages: readonly string[]): InterfaceLanguage {
  if (setting) return setting;
  for (const tag of preferredLanguages) {
    const base = tag.toLowerCase().split("-")[0];
    const supported = interfaceLanguages.find((language) => language === base);
    if (supported) return supported;
  }
  return "fr";
}
