import type { CatalogSource } from "../domain/catalogLoader.ts";

/** Downloads the catalog over HTTP from `baseUrl` (VITE_CATALOG_BASE_URL). */
export class HttpCatalogSource implements CatalogSource {
  constructor(private readonly baseUrl: string) {}

  async fetchManifest(): Promise<unknown> {
    const response = await fetch(this.#url("manifest.json"), { cache: "no-cache" });
    if (!response.ok) throw new Error(`manifest.json: HTTP ${response.status}`);
    return response.json();
  }

  async fetchCatalog(onProgress: (fraction: number | null) => void): Promise<string> {
    const response = await fetch(this.#url("catalog.json"), { cache: "no-cache" });
    if (!response.ok) throw new Error(`catalog.json: HTTP ${response.status}`);
    // Content-Length is the transferred size; it is only meaningful if the body is not compressed.
    const length = Number(response.headers.get("content-length"));
    const total = response.headers.get("content-encoding") ? 0 : length;
    if (!response.body) return response.text();

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let received = 0;
    onProgress(total > 0 ? 0 : null);
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.byteLength;
      onProgress(total > 0 ? Math.min(received / total, 0.99) : null);
    }
    const bytes = new Uint8Array(received);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return new TextDecoder().decode(bytes);
  }

  #url(file: string): string {
    return new URL(file, new URL(this.baseUrl, globalThis.location.href)).href;
  }
}
