import { useSyncExternalStore } from "react";

// "Télécharger toutes les images" (spec §6, §7): the service worker caches each
// image it serves (cache first), so fetching every image fills the cache.
// The state lives outside React so that the download goes on when the
// settings screen is left.

export type ImageDownloadState =
  | { status: "idle" }
  | { status: "running"; done: number; total: number }
  | { status: "finished"; total: number; failed: number };

const CONCURRENCY = 4;
let state: ImageDownloadState = { status: "idle" };
const listeners = new Set<() => void>();

function setState(next: ImageDownloadState) {
  state = next;
  for (const listener of listeners) listener();
}

export function useImageDownload(): ImageDownloadState {
  return useSyncExternalStore(
    (callback) => {
      listeners.add(callback);
      return () => listeners.delete(callback);
    },
    () => state,
    () => state,
  );
}

/** Downloads the given image URLs, a few at a time. Resolves with the number of failures. */
export async function downloadImages(urls: readonly string[]): Promise<number> {
  if (state.status === "running") return 0;
  let done = 0;
  let failed = 0;
  let next = 0;
  setState({ status: "running", done, total: urls.length });
  const worker = async () => {
    while (next < urls.length) {
      const url = urls[next++]!;
      try {
        const response = await fetch(url);
        if (!response.ok) failed++;
        await response.arrayBuffer();
      } catch {
        failed++;
      }
      done++;
      setState({ status: "running", done, total: urls.length });
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  setState({ status: "finished", total: urls.length, failed });
  return failed;
}
