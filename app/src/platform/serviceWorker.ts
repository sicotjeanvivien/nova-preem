import { registerSW } from "virtual:pwa-register";
import { markAppShellCached } from "./connectivity.ts";

/** Registers the service worker (production builds only) and tracks when the app shell is cached. */
export function registerServiceWorker(): void {
  registerSW({
    immediate: true,
    onOfflineReady: markAppShellCached,
    onRegisteredSW(_url, registration) {
      if (registration?.active) markAppShellCached();
    },
  });
}
