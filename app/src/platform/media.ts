import { useSyncExternalStore } from "react";

/** Width from which the desktop layout applies (docs/app-spec.md §8); keep in sync with app.css. */
const DESKTOP_QUERY = "(min-width: 900px)";

function subscribe(callback: () => void) {
  const query = window.matchMedia(DESKTOP_QUERY);
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
}

/** True on the desktop layout. For long lists, rendering one layout is lighter than hiding the other in CSS. */
export function useIsDesktop(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(DESKTOP_QUERY).matches,
    () => false,
  );
}
