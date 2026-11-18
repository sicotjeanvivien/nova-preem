import type { PriceSource } from "../domain/prices.ts";

/** Downloads prices.json from `baseUrl` (VITE_PRICES_BASE_URL): our own domain, never Cardmarket. */
export class HttpPriceSource implements PriceSource {
  constructor(private readonly baseUrl: string) {}

  async download(): Promise<unknown> {
    const url = new URL("prices.json", new URL(this.baseUrl, globalThis.location.href)).href;
    const response = await fetch(url, { cache: "no-cache" });
    if (!response.ok) throw new Error(`prices.json: HTTP ${response.status}`);
    return response.json();
  }
}
