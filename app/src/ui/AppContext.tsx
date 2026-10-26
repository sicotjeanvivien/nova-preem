import { createContext, useContext } from "react";
import type { CatalogIndex } from "../domain/catalogIndex.ts";
import type { Settings } from "../domain/settings.ts";
import type { StoredCatalog } from "../domain/stores.ts";
import type { Services } from "../platform/services.ts";

export interface AppContextValue {
  services: Services;
  catalog: StoredCatalog;
  index: CatalogIndex;
  settings: Settings;
  updateSettings(changes: Partial<Settings>): void;
}

export const AppContext = createContext<AppContextValue | null>(null);

export function useApp(): AppContextValue {
  const value = useContext(AppContext);
  if (!value) throw new Error("useApp must be used inside AppContext");
  return value;
}
