// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CollectionEntry } from "../../src/domain/collection.ts";
import { connectedState, type SyncState } from "../../src/domain/sync.ts";
import { RemoteError } from "../../src/domain/syncEngine.ts";
import { printingOf } from "../helpers-catalog.ts";
import { fakeSyncServices, MemoryDrive, MemorySyncStore, SYNC_SETTINGS } from "../helpers-sync.ts";
import { setOnline, setViewportWidth, TestApp } from "./harness.tsx";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const T1 = "2026-10-20T10:00:00.000Z";
const johnny = printingOf("Johnny Silverhand — Rocking Renegade", "wnc-retail", "fr").id;
const chrome = printingOf("Chrome Fang", "wnc-retail", "fr").id;
const e = (printingId: string, quantity: number): CollectionEntry => ({ printingId, quantity, firstAddedAt: T1, lastAddedAt: T1 });

/** A device already synced: its base is `entries`, in file-1 of `drive`; the token lasts `tokenMs`. */
async function synced(drive: MemoryDrive, entries: CollectionEntry[], tokenMs = 3_600_000): Promise<SyncState> {
  const file = await drive.put(entries);
  return {
    ...connectedState("someone@example.com", { value: "token", expiresAt: new Date(Date.now() + tokenMs).toISOString() }),
    fileId: file.id,
    base: { entries, settings: SYNC_SETTINGS },
    baseVersion: file.version,
    lastSyncAt: new Date(Date.now() - 60 * 60_000).toISOString(),
  };
}

/** What another device wrote: the file now holds `entries`. */
function writtenElsewhere(drive: MemoryDrive, entries: CollectionEntry[]) {
  const file = drive.files.get("file-1")!;
  file.text = JSON.stringify({ ...JSON.parse(file.text), entries });
  file.version++;
}

describe("automatic sync (sync spec §5.1, step 3)", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    setViewportWidth(390);
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.useRealTimers();
    setViewportWidth(1024);
    setOnline(true);
  });

  const flush = () => act(async () => {});
  const render = async (props: Parameters<typeof TestApp>[0]) => {
    await act(async () => root.render(<TestApp {...props} />));
    await flush();
  };
  const advance = (ms: number) => act(async () => vi.advanceTimersByTimeAsync(ms));
  const button = (name: string) => [...container.querySelectorAll("button")].find((b) => b.textContent === name);
  const pill = () => container.querySelector<HTMLAnchorElement>(".sync-pill--header");
  const fileEntries = (drive: MemoryDrive) => drive.entriesOf("file-1");

  it("syncs at launch: local changes leave, remote ones arrive", async () => {
    const drive = new MemoryDrive();
    const sync = fakeSyncServices(drive, new MemorySyncStore(await synced(drive, [e(johnny, 1)])));
    writtenElsewhere(drive, [e(johnny, 1), e(chrome, 1)]);
    await render({ path: "/collection", entries: [e(johnny, 2)], services: { sync } });
    expect(fileEntries(drive)).toEqual([e(johnny, 2), e(chrome, 1)].sort((a, b) => (a.printingId < b.printingId ? -1 : 1)));
    expect(pill()?.getAttribute("aria-label")).toBe("Google Drive : Synchronisé");
  });

  it("syncs 5 s after the last change, once for a burst", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const drive = new MemoryDrive();
    const sync = fakeSyncServices(drive, new MemorySyncStore(await synced(drive, [e(johnny, 1)])));
    await render({ path: "/reglages", entries: [e(johnny, 1)], services: { sync } });
    const writes = drive.writes;

    const plus = container.querySelector<HTMLElement>('[aria-label="Seuil de doublon plus un"]')!;
    await act(async () => plus.click());
    await advance(3_000);
    await act(async () => plus.click());
    expect(pill()?.textContent).toBe("En attente · 1");
    await advance(4_000);
    expect(drive.writes).toBe(writes);
    await advance(1_000);
    expect(drive.writes).toBe(writes + 1);
    expect(JSON.parse(drive.files.get("file-1")!.text).settings.duplicateThreshold).toBe(3);
  });

  it("sends a change made during a sync with the next one", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    let release!: () => void;
    const drive = new (class extends MemoryDrive {
      gate: Promise<void> | null = null;
      override async download(file: Parameters<MemoryDrive["download"]>[0]) {
        if (this.gate) await this.gate;
        return super.download(file);
      }
    })();
    const sync = fakeSyncServices(drive, new MemorySyncStore(await synced(drive, [e(johnny, 1)])));
    drive.gate = new Promise((resolve) => (release = resolve));
    await render({ path: "/reglages", entries: [e(johnny, 1)], services: { sync } });
    // The launch sync waits on the download; the user changes a synced setting meanwhile.
    await act(async () => container.querySelector<HTMLElement>('[aria-label="Seuil de doublon plus un"]')!.click());
    drive.gate = null;
    await act(async () => release());
    await flush();
    expect(JSON.parse(drive.files.get("file-1")!.text).settings.duplicateThreshold).toBe(1);
    expect(pill()?.textContent).toBe("En attente · 1");

    await advance(5_000);
    expect(JSON.parse(drive.files.get("file-1")!.text).settings.duplicateThreshold).toBe(2);
  });

  it("waits for the network, then syncs when it comes back", async () => {
    const drive = new MemoryDrive();
    const sync = fakeSyncServices(drive, new MemorySyncStore(await synced(drive, [e(johnny, 1)])));
    setOnline(false);
    await render({ path: "/sets", entries: [e(johnny, 3)], services: { sync } });
    expect(fileEntries(drive)).toEqual([e(johnny, 1)]);
    expect(pill()?.textContent).toBe("En attente · 1");

    await act(async () => setOnline(true));
    await flush();
    expect(fileEntries(drive)).toEqual([e(johnny, 3)]);
  });

  it("syncs when the app comes back to the foreground", async () => {
    const drive = new MemoryDrive();
    const sync = fakeSyncServices(drive, new MemorySyncStore(await synced(drive, [e(johnny, 1)])));
    await render({ path: "/reglages", entries: [e(johnny, 1)], services: { sync } });
    writtenElsewhere(drive, [e(johnny, 4)]);
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    await act(async () => document.dispatchEvent(new Event("visibilitychange")));
    await flush();
    expect(container.textContent).toContain("Collection");
    expect(sync.store.state?.base?.entries).toEqual([e(johnny, 4)]);
  });

  it("retries a network failure later, without showing an error", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const drive = new MemoryDrive();
    const sync = fakeSyncServices(drive, new MemorySyncStore(await synced(drive, [e(johnny, 1)])));
    drive.failNextUpdate = new RemoteError("network");
    await render({ path: "/reglages", entries: [e(johnny, 2)], services: { sync } });
    expect(fileEntries(drive)).toEqual([e(johnny, 1)]);
    expect(container.querySelector(".sync-card")?.textContent).toContain("En attente");
    expect(container.querySelector('.sync-card [role="alert"]')).toBeNull();

    await advance(29_000);
    expect(fileEntries(drive)).toEqual([e(johnny, 1)]);
    await advance(1_000);
    expect(fileEntries(drive)).toEqual([e(johnny, 2)]);
  });

  it("pauses when the token expires: pill, banner after the offline one, resume", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    const drive = new MemoryDrive();
    const sync = fakeSyncServices(drive, new MemorySyncStore(await synced(drive, [e(johnny, 1)], 60_000)));
    await render({ path: "/collection", entries: [e(johnny, 1)], services: { sync } });
    expect(container.querySelector(".sync-banner")).toBeNull();

    await advance(62_000);
    expect(pill()?.textContent).toBe("En pause");
    const banner = container.querySelector(".sync-banner")!;
    expect(banner.textContent).toBe("Synchronisation en pause. Vos saisies restent sur l'appareil.Reprendre");

    await act(async () => setOnline(false));
    const banners = [...container.querySelectorAll(".offline-banner")].map((b) => b.classList.contains("sync-banner"));
    expect(banners).toEqual([false, true]);
    await act(async () => setOnline(true));

    await act(async () => button("Reprendre")!.click());
    await flush();
    expect(container.querySelector(".sync-banner")).toBeNull();
    expect(pill()?.getAttribute("aria-label")).toBe("Google Drive : Synchronisé");
  });

  it("shows no indicator while the sync is off, and leads to Settings otherwise", async () => {
    await render({ path: "/sets", services: { sync: fakeSyncServices() } });
    expect(pill()).toBeNull();

    const drive = new MemoryDrive();
    const sync = fakeSyncServices(drive, new MemorySyncStore(await synced(drive, [])));
    await render({ path: "/sets", services: { sync } });
    expect(pill()?.getAttribute("href")).toBe("/reglages#sync");
    expect(pill()?.textContent).toBe("");
  });

  it("adds a line to the desktop sidebar, with the resume button while paused", async () => {
    setViewportWidth(1280);
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    const drive = new MemoryDrive();
    const sync = fakeSyncServices(drive, new MemorySyncStore(await synced(drive, [e(johnny, 1)], 60_000)));
    await render({ path: "/stats", entries: [e(johnny, 1)], services: { sync } });
    expect(container.querySelector(".sync-line")?.textContent).toBe("Drive : Synchronisé");
    expect(button("Reprendre la synchronisation")).toBeUndefined();

    await advance(62_000);
    expect(container.querySelector(".sync-line")?.textContent).toBe("Drive : En pause");
    expect(button("Reprendre la synchronisation")).toBeDefined();
    expect(container.querySelector(".sync-banner")?.textContent).toContain("Vos saisies restent dans ce navigateur.");
  });
});
