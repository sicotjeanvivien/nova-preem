import type { Rarity } from "../domain/catalog.ts";
import type { Translator } from "../i18n/i18n.tsx";
import type { MessageKey } from "../i18n/messages.ts";

const KNOWN_LANGUAGES = ["en", "fr"];
const KNOWN_RARITIES = ["common", "uncommon", "rare", "epic", "nova-rare", "secret"];
const KNOWN_COLORS = ["red", "yellow", "blue", "green"];

/** "VF" / "VO" in French, "FR" / "EN" in English. */
export function languageLabel(t: Translator["t"], language: string): string {
  return KNOWN_LANGUAGES.includes(language) ? t(`language.short.${language}` as MessageKey) : language.toUpperCase();
}

/** Short rarity label, always written next to the color (spec §8). */
export function rarityShort(t: Translator["t"], rarity: Rarity | undefined): string {
  if (!rarity) return "?";
  if (rarity.iconic) return t("rarity.iconic");
  return KNOWN_RARITIES.includes(rarity.id) ? t(`rarity.${rarity.id}` as MessageKey) : rarity.id.slice(0, 2).toUpperCase();
}

export function rarityColor(rarity: Rarity | undefined): string {
  if (!rarity) return "var(--color-text-muted)";
  if (rarity.iconic) return "var(--color-rarity-iconic)";
  return KNOWN_RARITIES.includes(rarity.id) ? `var(--color-rarity-${rarity.id})` : "var(--color-text-muted)";
}

/** Color stripe of a card tile. */
export function cardColor(color: string | null): string {
  return color && KNOWN_COLORS.includes(color) ? `var(--color-card-${color})` : "var(--color-border-strong)";
}

const KNOWN_TYPES = ["legend", "unit", "gear", "program"];

/** "VF" / "Français"… */
export function languageName(t: Translator["t"], language: string): string {
  return KNOWN_LANGUAGES.includes(language) ? t(`language.name.${language}` as MessageKey) : language.toUpperCase();
}

export function cardTypeLabel(t: Translator["t"], type: string): string {
  return KNOWN_TYPES.includes(type) ? t(`type.${type}` as MessageKey) : type;
}

export function cardColorLabel(t: Translator["t"], color: string): string {
  return KNOWN_COLORS.includes(color) ? t(`color.${color}` as MessageKey) : color;
}

/** Light text color matching a card color, readable on the dark background. */
export function cardColorText(color: string | null): string {
  return color && KNOWN_COLORS.includes(color) ? `var(--color-card-${color}-text)` : "var(--color-text-secondary)";
}
