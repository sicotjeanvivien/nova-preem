import pkg from "../package.json" with { type: "json" };

export const USER_AGENT = `nova-preem-catalog/${pkg.version} (+https://github.com/sicotjeanvivien/nova-preem)`;

const MIN_INTERVAL_MS = 1000;
const MAX_ATTEMPTS = 3;

/**
 * HTTP client that is polite to the source: sequential requests, at most one
 * per second, identifiable User-Agent, retry with backoff on 429/5xx.
 */
export class PoliteClient {
  #queue: Promise<unknown> = Promise.resolve();
  #lastRequestAt = 0;
  requestCount = 0;

  fetch(url: string, init: RequestInit = {}): Promise<Response> {
    const run = this.#queue.then(() => this.#fetchWithRetry(url, init));
    this.#queue = run.catch(() => undefined);
    return run;
  }

  async #fetchWithRetry(url: string, init: RequestInit): Promise<Response> {
    for (let attempt = 1; ; attempt++) {
      await this.#throttle();
      const response = await fetch(url, {
        ...init,
        headers: { "User-Agent": USER_AGENT, ...init.headers },
      });
      this.requestCount++;
      const retryable = response.status === 429 || response.status >= 500;
      if (!retryable || attempt >= MAX_ATTEMPTS) return response;
      await response.body?.cancel();
      const retryAfter = Number(response.headers.get("retry-after"));
      const delayMs = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 5000 * attempt;
      console.warn(`HTTP ${response.status} on ${url}, retrying in ${delayMs} ms`);
      await sleep(delayMs);
    }
  }

  async #throttle(): Promise<void> {
    const wait = this.#lastRequestAt + MIN_INTERVAL_MS - Date.now();
    if (wait > 0) await sleep(wait);
    this.#lastRequestAt = Date.now();
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
