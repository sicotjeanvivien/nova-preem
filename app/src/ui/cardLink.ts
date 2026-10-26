import type { Location } from "react-router";

/**
 * History state of a link to a card page: where it was opened from (for the
 * contextual back button and previous / next, spec §5.9), and which variant
 * and language were shown there.
 */
export interface CardLinkState {
  from: Pick<Location, "pathname" | "search">;
  variantKey: string | null;
  language: string | null;
}

export function cardLinkState(from: Pick<Location, "pathname" | "search">, variantKey: string | null, language: string | null): CardLinkState {
  return { from: { pathname: from.pathname, search: from.search }, variantKey, language };
}

export function readCardLinkState(state: unknown): CardLinkState | null {
  if (!state || typeof state !== "object" || !("from" in state)) return null;
  const { from, variantKey, language } = state as Partial<CardLinkState>;
  if (!from || typeof from.pathname !== "string") return null;
  return { from: { pathname: from.pathname, search: from.search ?? "" }, variantKey: variantKey ?? null, language: language ?? null };
}
