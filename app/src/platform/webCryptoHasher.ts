import type { Hasher } from "../domain/catalogLoader.ts";

export const webCryptoHasher: Hasher = {
  async sha256(text) {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    const hex = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
    return `sha256:${hex}`;
  },
};
