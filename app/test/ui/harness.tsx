import type { ReactNode } from "react";
import { createMemoryRouter, RouterProvider, type RouteObject } from "react-router";
import { manifestSchema } from "../../src/domain/catalog.ts";
import type { CollectionEntry } from "../../src/domain/collection.ts";
import { DEFAULT_SETTINGS, type Settings } from "../../src/domain/settings.ts";
import type { CollectionStore } from "../../src/domain/stores.ts";
import { I18nProvider } from "../../src/i18n/i18n.tsx";
import type { Services } from "../../src/platform/services.ts";
import { AppContext } from "../../src/ui/AppContext.tsx";
import { AppLayout } from "../../src/ui/AppLayout.tsx";
import { CollectionProvider } from "../../src/ui/CollectionContext.tsx";
import { CardScreen } from "../../src/ui/screens/CardScreen.tsx";
import { CollectionScreen } from "../../src/ui/screens/CollectionScreen.tsx";
import { SettingsScreen } from "../../src/ui/screens/EmptyScreen.tsx";
import { SearchScreen } from "../../src/ui/screens/SearchScreen.tsx";
import { SetPage } from "../../src/ui/screens/SetPage.tsx";
import { SetsScreen } from "../../src/ui/screens/SetsScreen.tsx";
import { index } from "../helpers-catalog.ts";
import { realManifest } from "../helpers.ts";

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
      { path: "sets/:setId", element: <SetPage /> },
      { path: "cartes/:slug", element: <CardScreen /> },
      { path: "collection", element: <CollectionScreen /> },
      { path: "recherche", element: <SearchScreen /> },
      { path: "reglages", element: <SettingsScreen /> },
    ],
  },
];

/** The app at `path`, with the real catalog and a given collection. */
export function TestApp({
  path,
  language = "fr",
  entries = [],
  store = new MemoryCollectionStore(),
  settings = DEFAULT_SETTINGS,
}: {
  path: string;
  language?: "fr" | "en";
  entries?: CollectionEntry[];
  store?: CollectionStore;
  settings?: Settings;
}): ReactNode {
  const context = {
    services: { collection: store, imageBaseUrl: "http://localhost/catalog/images/" } as Services,
    catalog: { manifest: manifestSchema.parse(realManifest), catalog: index.catalog },
    index,
    settings,
  };
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  return (
    <I18nProvider language={language}>
      <AppContext.Provider value={context}>
        <CollectionProvider store={store} initial={entries}>
          <RouterProvider router={router} />
        </CollectionProvider>
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
