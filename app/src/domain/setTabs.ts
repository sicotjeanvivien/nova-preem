import type { Release, ReleaseGroup } from "./catalog.ts";

/**
 * Release groups used by the release filter of the Collection (spec §5.7, as
 * in the mockups): one entry per release of the `main` group (Retail, Beta),
 * then one per other group (Starters, Démos, Promos). Empty groups are left out.
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

/**
 * Short label of a release inside its set: "Welcome to Night City — Retail" → "Retail",
 * "The Heist — Retail Starter Deck" → "The Heist — Retail", "Merc Demo Deck" → "Merc".
 */
export function releaseShortName(name: string, setName: string): string {
  const withoutSet = name.startsWith(`${setName} — `) ? name.slice(setName.length + 3) : name;
  return withoutSet.replace(/\s+(Starter Deck|Demo Deck)$/, "").trim() || name;
}
