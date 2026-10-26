import type { Release, ReleaseGroup } from "./catalog.ts";

/**
 * The fixed tabs of a set page (docs/app-spec.md §2.1): one tab per release of
 * the `main` group (Retail, Beta), then one tab per other group (Starters,
 * Démos, Promos) with a sub-filter on its releases. Empty tabs are not shown.
 */
export interface SetTab {
  /** Release id for a main release, group name for a group tab. */
  id: string;
  kind: "release" | "group";
  group: ReleaseGroup;
  releases: Release[];
}

const GROUP_TABS: ReleaseGroup[] = ["starter", "demo", "promo", "unknown"];

export function buildSetTabs(releases: readonly Release[], hasPrintings: (release: Release) => boolean): SetTab[] {
  const present = [...releases].filter(hasPrintings).sort((a, b) => a.order - b.order);
  const mainTabs: SetTab[] = present
    .filter((release) => release.group === "main")
    .map((release) => ({ id: release.id, kind: "release", group: "main", releases: [release] }));
  const groupTabs: SetTab[] = GROUP_TABS.map((group) => ({
    id: group,
    kind: "group" as const,
    group,
    releases: present.filter((release) => release.group === group),
  })).filter((tab) => tab.releases.length > 0);
  return [...mainTabs, ...groupTabs];
}

export interface TabSelection {
  tab: SetTab;
  /** For a group tab: the release chosen in the sub-filter, or null for "Tous". */
  release: Release | null;
  /** Releases shown. */
  releases: Release[];
}

/**
 * Resolves the `tirage` URL parameter (a release id or a group name). Without
 * it, or if unknown: the tab of the entry release of the settings (sub-filter
 * "Tous"), else the first tab (spec §2.1).
 */
export function selectTab(tabs: readonly SetTab[], param: string | null, entryReleaseId: string): TabSelection | null {
  const byParam = param ? find(tabs, param) : null;
  if (byParam) return byParam;
  const entry = find(tabs, entryReleaseId);
  if (entry) return { ...entry, release: null, releases: entry.tab.releases };
  const first = tabs[0];
  return first ? { tab: first, release: null, releases: first.releases } : null;
}

function find(tabs: readonly SetTab[], id: string): TabSelection | null {
  for (const tab of tabs) {
    if (tab.id === id) return { tab, release: null, releases: tab.releases };
    const release = tab.releases.find((r) => r.id === id);
    if (release) return { tab, release: tab.kind === "group" ? release : null, releases: tab.kind === "group" ? [release] : tab.releases };
  }
  return null;
}

/** Value of the `tirage` URL parameter for a selection. */
export function tabParam(selection: Pick<TabSelection, "tab" | "release">): string {
  return selection.release?.id ?? selection.tab.id;
}

/**
 * Short label of a release inside its set: "Welcome to Night City — Retail" → "Retail",
 * "The Heist — Retail Starter Deck" → "The Heist — Retail", "Merc Demo Deck" → "Merc".
 */
export function releaseShortName(name: string, setName: string): string {
  const withoutSet = name.startsWith(`${setName} — `) ? name.slice(setName.length + 3) : name;
  return withoutSet.replace(/\s+(Starter Deck|Demo Deck)$/, "").trim() || name;
}
