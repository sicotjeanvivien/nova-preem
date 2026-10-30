import { useState, type ReactNode } from "react";
import { createMemoryRouter, RouterProvider, type RouteObject } from "react-router";
import { manifestSchema } from "../../src/domain/catalog.ts";
import { indexCatalog } from "../../src/domain/catalogIndex.ts";
import type { CollectionEntry } from "../../src/domain/collection.ts";
import { DEFAULT_SETTINGS, type Settings } from "../../src/domain/settings.ts";
import type { CollectionStore } from "../../src/domain/stores.ts";
import { I18nProvider } from "../../src/i18n/i18n.tsx";
import type { Services } from "../../src/platform/services.ts";
import { AppContext } from "../../src/ui/AppContext.tsx";
import { AppLayout } from "../../src/ui/AppLayout.tsx";
import type { CatalogSource } from "../../src/domain/catalogLoader.ts";
import type { StoredCatalog } from "../../src/domain/stores.ts";
import { CatalogUpdateProvider } from "../../src/ui/CatalogUpdate.tsx";
import { CollectionProvider } from "../../src/ui/CollectionContext.tsx";
import { CardScreen } from "../../src/ui/screens/CardScreen.tsx";
import { CardViewerScreen } from "../../src/ui/screens/CardViewerScreen.tsx";
import { CollectionScreen } from "../../src/ui/screens/CollectionScreen.tsx";
import { SettingsScreen } from "../../src/ui/screens/SettingsScreen.tsx";
import { StatsScreen } from "../../src/ui/screens/StatsScreen.tsx";
import { SearchScreen } from "../../src/ui/screens/SearchScreen.tsx";
import { ReleaseCardsScreen } from "../../src/ui/screens/ReleaseCardsScreen.tsx";
import { SetReleasesScreen } from "../../src/ui/screens/SetReleasesScreen.tsx";
import { SetsScreen } from "../../src/ui/screens/SetsScreen.tsx";
import { SyncProvider } from "../../src/ui/SyncContext.tsx";
import { index } from "../helpers-catalog.ts";
import { fakeSource, MemoryCatalogStore, nodeHasher, realManifest } from "../helpers.ts";

/** In-memory collection store, recording the writes. */
export class MemoryCollectionStore implements CollectionStore {
  entries = new Map<string, CollectionEntry>();
  writes: string[] = [];

  async list() {
    return [...this.entries.values()];
  }
  async get(id: string) {
    return this.entries.get(id);
  }
  async put(entry: CollectionEntry) {
    this.entries.set(entry.printingId, entry);
    this.writes.push(`put ${entry.printingId} ${entry.quantity}`);
  }
  async remove(id: string) {
    this.entries.delete(id);
    this.writes.push(`remove ${id}`);
  }
  async replaceAll(entries: CollectionEntry[]) {
    this.entries = new Map(entries.map((e) => [e.printingId, e]));
  }
  async exportAll() {
    return [...this.entries.values()].sort((a, b) => (a.printingId < b.printingId ? -1 : 1));
  }
}

const routes: RouteObject[] = [
  {
    path: "/",
    element: <AppLayout />,
    children: [
      { path: "sets", element: <SetsScreen /> },
      { path: "sets/:setId", element: <SetReleasesScreen /> },
      { path: "sets/:setId/:releaseId", element: <ReleaseCardsScreen /> },
      { path: "cartes/:slug", element: <CardScreen /> },
      { path: "cartes/:slug/3d", element: <CardViewerScreen /> },
      { path: "collection", element: <CollectionScreen /> },
      { path: "recherche", element: <SearchScreen /> },
      { path: "stats", element: <StatsScreen /> },
      { path: "reglages", element: <SettingsScreen /> },
    ],
  },
];

/** The app at `path`, with the real catalog and a given collection. */
export function TestApp({
  path,
  language,
  entries = [],
  store = new MemoryCollectionStore(),
  settings: initialSettings = DEFAULT_SETTINGS,
  services: extraServices = {},
  catalogSource = fakeSource(),
  catalogStore = new MemoryCatalogStore(),
  checkAtLaunch = false,
}: {
  path: string;
  language?: "fr" | "en";
  entries?: CollectionEntry[];
  store?: CollectionStore;
  settings?: Settings;
  services?: Partial<Services>;
  catalogSource?: CatalogSource;
  catalogStore?: MemoryCatalogStore;
  checkAtLaunch?: boolean;
}): ReactNode {
  const [settings, setSettings] = useState(initialSettings);
  const [catalog, setCatalog] = useState<StoredCatalog>(() => ({ manifest: manifestSchema.parse(realManifest), catalog: index.catalog }));
  const [catalogIndex, setCatalogIndex] = useState(index);
  const [router] = useState(() => createMemoryRouter(routes, { initialEntries: [path] }));
  const context = {
    services: {
      collection: store,
      catalog: { store: catalogStore, source: catalogSource, hasher: nodeHasher },
      imageBaseUrl: "http://localhost/catalog/images/",
      appVersion: "0.1.0",
      sync: null,
      ...extraServices,
    } as Services,
    catalog,
    index: catalogIndex,
    settings,
    updateSettings: (changes: Partial<Settings>) => setSettings((current) => ({ ...current, ...changes })),
  };
  return (
    <I18nProvider language={language ?? settings.interfaceLanguage ?? "fr"}>
      <AppContext.Provider value={context}>
        <CatalogUpdateProvider
          checkAtLaunch={checkAtLaunch}
          onUpdated={(next) => {
            setCatalog(next);
            setCatalogIndex(indexCatalog(next.catalog));
          }}
        >
          <CollectionProvider store={store} initial={entries}>
            <SyncProvider>
              <RouterProvider router={router} />
            </SyncProvider>
          </CollectionProvider>
        </CatalogUpdateProvider>
      </AppContext.Provider>
    </I18nProvider>
  );
}

export function entry(printingId: string, quantity: number): CollectionEntry {
  return { printingId, quantity, firstAddedAt: "2026-10-26T10:00:00.000Z", lastAddedAt: "2026-10-26T10:00:00.000Z" };
}

/** Visible text of an HTML string, whitespace collapsed. */
export const text = (html: string) =>
  html
    // React separates adjacent text parts with empty comments: they are not spaces.
    .replace(/<!-- -->/g, "")
    .replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");

/** Sets the window width of the simulated DOM (happy-dom), for the mobile or desktop layout. */
export function setViewportWidth(width: number) {
  (window as unknown as { happyDOM?: { setViewport(size: { width: number; height: number }): void } }).happyDOM?.setViewport({ width, height: 900 });
}

/** Simulated network. Offline, the automatic sync leaves the displayed state alone. */
export function setOnline(value: boolean) {
  Object.defineProperty(navigator, "onLine", { value, configurable: true });
  window.dispatchEvent(new Event(value ? "online" : "offline"));
}
