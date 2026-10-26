import { useSyncExternalStore } from "react";

// Browser state the interface displays: network and offline readiness of the app shell.

function subscribeOnline(callback: () => void) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

export function useOnline(): boolean {
  return useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
}

let appShellCached = typeof navigator !== "undefined" && Boolean(navigator.serviceWorker?.controller);
const listeners = new Set<() => void>();

/** Called once the service worker has cached the app shell (see serviceWorker.ts). */
export function markAppShellCached() {
  if (appShellCached) return;
  appShellCached = true;
  for (const listener of listeners) listener();
}

/** True once the service worker has cached the app, so that it can start without network. */
export function useAppShellCached(): boolean {
  return useSyncExternalStore(
    (callback) => {
      listeners.add(callback);
      return () => listeners.delete(callback);
    },
    () => appShellCached,
    () => false,
  );
}
