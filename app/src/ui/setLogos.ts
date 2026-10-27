import wnc from "./assets/sets/wnc.png";

/**
 * Logo of each set, by set id, shown on its tile in the set list. Bundled with the
 * app (and precached), since the catalog has no set images. A set without a logo
 * keeps the generic icon.
 */
export const SET_LOGOS: Readonly<Record<string, string>> = { wnc };
