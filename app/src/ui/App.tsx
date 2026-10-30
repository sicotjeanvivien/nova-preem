import { useCallback, useEffect, useMemo, useState } from "react";
import { createBrowserRouter, Navigate, RouterProvider, type RouteObject } from "react-router";
import { indexCatalog } from "../domain/catalogIndex.ts";
import { CatalogError, downloadCatalog, type CatalogErrorCode } from "../domain/catalogLoader.ts";
import type { CollectionEntry } from "../domain/collection.ts";
import { resolveInterfaceLanguage, type Settings } from "../domain/settings.ts";
import type { StoredCatalog } from "../domain/stores.ts";
import { I18nProvider } from "../i18n/i18n.tsx";
import type { Services } from "../platform/services.ts";
import { AppContext } from "./AppContext.tsx";
import { AppLayout } from "./AppLayout.tsx";
import { CatalogUpdateProvider } from "./CatalogUpdate.tsx";
import { CollectionProvider } from "./CollectionContext.tsx";
import { FirstLaunch, FirstLaunchContext, type FirstLaunchProps } from "./FirstLaunch.tsx";
import { LEGAL_PAGES } from "./legalPages.ts";
import { LegalScreen } from "./screens/LegalScreen.tsx";
import { CollectionScreen } from "./screens/CollectionScreen.tsx";
import { SettingsScreen } from "./screens/SettingsScreen.tsx";
import { SyncProvider } from "./SyncContext.tsx";
import { StatsScreen } from "./screens/StatsScreen.tsx";
import { SearchScreen } from "./screens/SearchScreen.tsx";
import { CardScreen } from "./screens/CardScreen.tsx";
import { CardViewerScreen } from "./screens/CardViewerScreen.tsx";
import { ReleaseCardsScreen } from "./screens/ReleaseCardsScreen.tsx";
import { SetReleasesScreen } from "./screens/SetReleasesScreen.tsx";
import { SetsScreen } from "./screens/SetsScreen.tsx";

/** The legal pages (docs/legal-spec.md): they need no catalog. */
const legalRoutes: RouteObject[] = LEGAL_PAGES.map((page) => ({ path: page.path.slice(1), element: <LegalScreen id={page.id} /> }));

// Routers are created when they are shown, so that each one starts from the current URL:
// the first launch may already have navigated to a legal page.
const createAppRouter = () =>
  createBrowserRouter([
    {
      path: "/",
      element: <AppLayout />,
      children: [
        { index: true, element: <Navigate to="/sets" replace /> },
        { path: "sets", element: <SetsScreen /> },
        { path: "sets/:setId", element: <SetReleasesScreen /> },
        { path: "sets/:setId/:releaseId", element: <ReleaseCardsScreen /> },
        { path: "cartes/:slug", element: <CardScreen /> },
        { path: "cartes/:slug/3d", element: <CardViewerScreen /> },
        { path: "collection", element: <CollectionScreen /> },
        { path: "recherche", element: <SearchScreen /> },
        { path: "stats", element: <StatsScreen /> },
        { path: "reglages", element: <SettingsScreen /> },
        ...legalRoutes,
        { path: "*", element: <Navigate to="/sets" replace /> },
      ],
    },
  ]);

/** First launch: the download screen, and the legal pages it links to (spec §2). */
const createFirstLaunchRouter = () => createBrowserRouter([...legalRoutes, { path: "*", element: <FirstLaunch /> }]);

function Router({ create }: { create: typeof createAppRouter }) {
  const [router] = useState(create);
  return <RouterProvider router={router} />;
}

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
  const [entries, setEntries] = useState<CollectionEntry[] | null>(null);
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
      const [loadedSettings, stored, loadedEntries] = await Promise.all([
        services.settings.load(),
        services.catalog.store.load(),
        services.collection.list(),
      ]);
      if (cancelled) return;
      setSettings(loadedSettings);
      setEntries(loadedEntries);
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

  const index = useMemo(() => (boot.status === "ready" ? indexCatalog(boot.catalog.catalog) : null), [boot]);
  // Settings apply at once; they are written to the store in the background.
  const updateSettings = useCallback(
    (changes: Partial<Settings>) => {
      setSettings((current) => (current ? { ...current, ...changes } : current));
      services.settings.update(changes).catch((error: unknown) => console.error("Settings write failed", error));
    },
    [services],
  );
  const context = useMemo(
    () => (boot.status === "ready" && settings && index ? { services, catalog: boot.catalog, index, settings, updateSettings } : null),
    [boot, settings, services, index, updateSettings],
  );

  return (
    <I18nProvider language={language}>
      {boot.status === "downloading" && (
        <FirstLaunchContext.Provider value={{ progress: boot.progress, error: boot.error, onRetry: download } satisfies FirstLaunchProps}>
          <Router create={createFirstLaunchRouter} />
        </FirstLaunchContext.Provider>
      )}
      {context && entries && (
        <AppContext.Provider value={context}>
          <CatalogUpdateProvider onUpdated={(catalog) => setBoot({ status: "ready", catalog })} checkAtLaunch={navigator.onLine}>
            <CollectionProvider store={services.collection} initial={entries}>
              <SyncProvider>
                <Router create={createAppRouter} />
              </SyncProvider>
            </CollectionProvider>
          </CatalogUpdateProvider>
        </AppContext.Provider>
      )}
    </I18nProvider>
  );
}
