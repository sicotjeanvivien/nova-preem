import { useCallback, useEffect, useMemo, useState } from "react";
import { createBrowserRouter, Navigate, RouterProvider } from "react-router";
import { CatalogError, downloadCatalog, type CatalogErrorCode } from "../domain/catalogLoader.ts";
import { resolveInterfaceLanguage, type Settings } from "../domain/settings.ts";
import type { StoredCatalog } from "../domain/stores.ts";
import { I18nProvider } from "../i18n/i18n.tsx";
import type { Services } from "../platform/services.ts";
import { AppContext } from "./AppContext.tsx";
import { AppLayout } from "./AppLayout.tsx";
import { FirstLaunch } from "./FirstLaunch.tsx";
import { CollectionScreen, SearchScreen, SettingsScreen, StatsScreen } from "./screens/EmptyScreen.tsx";
import { SetsScreen } from "./screens/SetsScreen.tsx";

const router = createBrowserRouter([
  {
    path: "/",
    element: <AppLayout />,
    children: [
      { index: true, element: <Navigate to="/sets" replace /> },
      { path: "sets", element: <SetsScreen /> },
      { path: "collection", element: <CollectionScreen /> },
      { path: "recherche", element: <SearchScreen /> },
      { path: "stats", element: <StatsScreen /> },
      { path: "reglages", element: <SettingsScreen /> },
      { path: "*", element: <Navigate to="/sets" replace /> },
    ],
  },
]);

type Boot =
  | { status: "starting" }
  | { status: "downloading"; progress: number | null; error: CatalogErrorCode | null }
  | { status: "ready"; catalog: StoredCatalog };

/**
 * Startup (spec §6): the stored catalog is used right away, offline included.
 * Without one, the first-launch screen downloads it before anything else is shown.
 */
export function App({ services }: { services: Services }) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [boot, setBoot] = useState<Boot>({ status: "starting" });

  const download = useCallback(async () => {
    setBoot({ status: "downloading", progress: 0, error: null });
    try {
      const catalog = await downloadCatalog(services.catalog, (progress) =>
        setBoot((current) => (current.status === "downloading" ? { ...current, progress } : current)),
      );
      setBoot({ status: "ready", catalog });
    } catch (error) {
      console.error(error);
      setBoot({ status: "downloading", progress: 0, error: error instanceof CatalogError ? error.code : "network" });
    }
  }, [services]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [loadedSettings, stored] = await Promise.all([services.settings.load(), services.catalog.store.load()]);
      if (cancelled) return;
      setSettings(loadedSettings);
      if (stored) setBoot({ status: "ready", catalog: stored });
      else void download();
    })();
    return () => {
      cancelled = true;
    };
  }, [services, download]);

  const language = resolveInterfaceLanguage(settings?.interfaceLanguage ?? null, navigator.languages);
  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const context = useMemo(
    () => (boot.status === "ready" && settings ? { services, catalog: boot.catalog, settings } : null),
    [boot, settings, services],
  );

  return (
    <I18nProvider language={language}>
      {boot.status === "downloading" && <FirstLaunch progress={boot.progress} error={boot.error} onRetry={download} />}
      {context && (
        <AppContext.Provider value={context}>
          <RouterProvider router={router} />
        </AppContext.Provider>
      )}
    </I18nProvider>
  );
}
