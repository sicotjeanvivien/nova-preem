import { readFileSync } from "node:fs";
import { normalize } from "../src/normalize.ts";
import { Report } from "../src/report.ts";
import { parseListPage, toSnapshot } from "../src/sources/netdeck.ts";
import type { SourceSnapshot } from "../src/sources/types.ts";

export const FETCHED_AT = "2026-10-26T08:51:42.015Z";

/** Raw Netdeck list response with 9 real cards chosen for their edge cases (deep copy, safe to mutate). */
export function loadSamplePage(): { items: any[]; total: number; limit: number; offset: number } {
  return JSON.parse(readFileSync(new URL("./fixtures/cards-sample.json", import.meta.url), "utf8"));
}

export function snapshotFrom(page: unknown): SourceSnapshot {
  return toSnapshot([{ fetchedAt: FETCHED_AT, page: parseListPage(page) }]);
}

export function normalizeSample(mutate?: (page: ReturnType<typeof loadSamplePage>) => void) {
  const page = loadSamplePage();
  mutate?.(page);
  const report = new Report();
  const catalog = normalize(snapshotFrom(page), report);
  return { catalog, report };
}
