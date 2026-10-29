// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { CollectionEntry } from "../../src/domain/collection.ts";
import { DEFAULT_SETTINGS } from "../../src/domain/settings.ts";
import { connectedState, type SyncState } from "../../src/domain/sync.ts";
import { AuthError } from "../../src/domain/syncEngine.ts";
import { printingOf } from "../helpers-catalog.ts";
import { fakeSyncServices, MemoryDrive, MemorySyncStore, SYNC_SETTINGS } from "../helpers-sync.ts";
import { MemoryCollectionStore, setViewportWidth, TestApp } from "./harness.tsx";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const T1 = "2026-10-20T10:00:00.000Z";
const johnny = printingOf("Johnny Silverhand — Rocking Renegade", "wnc-retail", "fr").id;
const chrome = printingOf("Chrome Fang", "wnc-retail", "fr").id;
const e = (printingId: string, quantity: number): CollectionEntry => ({ printingId, quantity, firstAddedAt: T1, lastAddedAt: T1 });
const hourFromNow = () => new Date(Date.now() + 3_600_000).toISOString();

/** A device already synced: its base is `entries`, in file-1 of `drive`. */
async function syncedState(drive: MemoryDrive, entries: CollectionEntry[], changes: Partial<SyncState> = {}): Promise<SyncState> {
  const file = await drive.put(entries);
  return {
    ...connectedState("someone@example.com", { value: "token", expiresAt: hourFromNow() }),
    fileId: file.id,
    base: { entries, settings: SYNC_SETTINGS },
    baseVersion: file.version,
    lastSyncAt: new Date(Date.now() - 2 * 60_000).toISOString(),
    ...changes,
  };
}

describe("Google Drive sync in Settings (sync spec §8, screens 1 to 3)", () => {
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
    setViewportWidth(1024);
  });

  const card = () => container.querySelector<HTMLElement>(".sync-card")!;
  const button = (name: string, scope: ParentNode = container) => [...scope.querySelectorAll("button")].find((b) => b.textContent === name)!;
  const click = async (element: HTMLElement) => {
    await act(async () => element.click());
    await act(async () => {});
  };
  const render = async (props: Parameters<typeof TestApp>[0]) => {
    await act(async () => root.render(<TestApp {...props} />));
    await act(async () => {});
  };

  it("presents the sync when off, then connects and creates the file from the device", async () => {
    const sync = fakeSyncServices();
    await render({ path: "/reglages", entries: [e(johnny, 2)], services: { sync } });
    expect(card().textContent).toContain("Retrouvez votre collection sur tous vos appareils.");
    expect(card().textContent).toContain("Le fichier est enregistré dans votre Google Drive, dans un dossier « Nova Preem ».");
    expect(container.querySelector(".soon-badge")).toBeNull();

    await click(button("Synchroniser avec Google Drive"));
    expect(card().textContent).toContain("Connecté àsomeone@example.com");
    expect(card().textContent).toContain("À jourDernière synchronisation : à l'instant");
    expect(card().querySelector("a")?.getAttribute("href")).toBe("https://drive.example/file-1");
    expect(sync.drive.entriesOf("file-1")).toEqual([e(johnny, 2)]);
    expect(sync.store.state).toMatchObject({ fileId: "file-1", account: "someone@example.com" });
    expect(container.textContent).toContain("Exporter et Importer restent disponibles");
  });

  it("does nothing when the Google pop-up is closed", async () => {
    const sync = fakeSyncServices();
    sync.auth.failWith = new AuthError("cancelled");
    await render({ path: "/reglages", services: { sync } });
    await click(button("Synchroniser avec Google Drive"));
    expect(card().textContent).toContain("Synchroniser avec Google Drive");
    expect(sync.store.state).toBeUndefined();
  });

  it("asks how to combine two collections at the first sync, then merges (screen 3)", async () => {
    const sync = fakeSyncServices();
    await sync.drive.put([e(johnny, 1), e(chrome, 3), e("printing-of-a-future-catalog", 1)]);
    const store = new MemoryCollectionStore();
    await render({ path: "/reglages", entries: [e(johnny, 2)], store, services: { sync } });
    await click(button("Synchroniser avec Google Drive"));

    const dialog = container.querySelector<HTMLElement>('[role="dialog"]')!;
    expect(dialog.textContent).toContain("Une collection existe déjà dans votre Drive");
    expect(dialog.textContent).toContain("Google Drive3 impressionsFichier du 20 octobre 2026");
    expect(dialog.textContent).toContain("Cet appareil1 impression");
    expect(dialog.textContent).toContain("Sur cet appareil2 impressions ajoutées0 impression modifiée");
    expect(dialog.textContent).toContain("Dans Google Drive0 impression ajoutée1 impression modifiée");
    expect(dialog.textContent).toContain("1 impression inconnue du catalogue actuel est conservée.");
    // Until the choice, sync is not turned on: nothing is kept on the device.
    expect(sync.store.state).toBeUndefined();

    await click(dialog.querySelectorAll<HTMLInputElement>('input[type="radio"]')[1]!);
    expect(dialog.textContent).toContain("Sur cet appareil2 impressions ajoutées1 impression modifiée0 impression supprimée");
    expect(button("Remplacer cet appareil", dialog)).toBeDefined();
    await click(dialog.querySelectorAll<HTMLInputElement>('input[type="radio"]')[0]!);
    await click(button("Fusionner et synchroniser", dialog));

    expect(container.querySelector('[role="dialog"]')).toBeNull();
    const merged = [e(johnny, 2), e(chrome, 3), e("printing-of-a-future-catalog", 1)].sort((a, b) => (a.printingId < b.printingId ? -1 : 1));
    expect(await store.exportAll()).toEqual(merged);
    expect(sync.drive.entriesOf("file-1")).toEqual(merged);
    expect(card().textContent).toContain("À jour");
  });

  it("cancelling the first sync leaves sync off and changes nothing", async () => {
    const sync = fakeSyncServices();
    await sync.drive.put([e(chrome, 3)]);
    await render({ path: "/reglages", entries: [e(johnny, 2)], services: { sync } });
    await click(button("Synchroniser avec Google Drive"));
    await click(button("Annuler", container.querySelector('[role="dialog"]')!));
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(card().textContent).toContain("Synchroniser avec Google Drive");
    expect(sync.store.state).toBeUndefined();
    expect(sync.drive.entriesOf("file-1")).toEqual([e(chrome, 3)]);
  });

  it("syncs now: changes made on another device arrive, a removal disappears", async () => {
    const drive = new MemoryDrive();
    const state = await syncedState(drive, [e(johnny, 1), e(chrome, 1)]);
    const store = new MemoryCollectionStore();
    const sync = fakeSyncServices(drive, new MemorySyncStore(state));
    await render({ path: "/reglages", entries: [e(johnny, 1), e(chrome, 1)], store, services: { sync } });
    expect(card().textContent).toContain("À jourDernière synchronisation : il y a 2 min");

    // The other device removed Chrome Fang and added a copy of Johnny.
    drive.files.get("file-1")!.text = JSON.stringify({ ...JSON.parse(drive.files.get("file-1")!.text), entries: [e(johnny, 2)] });
    drive.files.get("file-1")!.version++;
    await click(button("Synchroniser maintenant"));
    expect(await store.exportAll()).toEqual([e(johnny, 2)]);
  });

  it("shows the pending changes, the pause and the resume", async () => {
    const drive = new MemoryDrive();
    const expired = await syncedState(drive, [e(johnny, 1)], { token: { value: "old", expiresAt: "2026-10-01T00:00:00.000Z" } });
    const sync = fakeSyncServices(drive, new MemorySyncStore(expired));
    await render({ path: "/reglages", entries: [e(johnny, 2), e(chrome, 1)], services: { sync } });
    expect(card().textContent).toContain("En pauseL'autorisation Google a expiré (au bout d'une heure). Un tap suffit pour reprendre.");
    expect(button("Synchroniser maintenant")).toBeUndefined();

    await click(button("Reprendre la synchronisation"));
    expect(drive.entriesOf("file-1")).toEqual([e(johnny, 2), e(chrome, 1)].sort((a, b) => (a.printingId < b.printingId ? -1 : 1)));
    expect(card().textContent).toContain("À jour");
  });

  it("counts the pending changes", async () => {
    const drive = new MemoryDrive();
    const sync = fakeSyncServices(drive, new MemorySyncStore(await syncedState(drive, [e(johnny, 1)])));
    await render({ path: "/reglages", entries: [e(johnny, 2), e(chrome, 1)], settings: { ...DEFAULT_SETTINGS, duplicateThreshold: 2 }, services: { sync } });
    expect(card().textContent).toContain("En attente3 modifications pas encore envoyées.");
  });

  it("explains a damaged Drive file and offers to retry", async () => {
    const drive = new MemoryDrive();
    const sync = fakeSyncServices(drive, new MemorySyncStore(await syncedState(drive, [e(johnny, 1)], { lastError: "invalid-file" })));
    await render({ path: "/reglages", entries: [e(johnny, 1)], services: { sync } });
    expect(card().textContent).toContain("ErreurRien n'a été modifié, ni sur l'appareil ni dans Drive.");
    expect(card().querySelector('[role="alert"]')?.textContent).toBe(
      "Le fichier de Drive est incomplet ou abîmé (modifié à la main ?). Supprimez-le dans Drive : il sera recréé depuis cet appareil.",
    );
    expect(button("Réessayer")).toBeDefined();
  });

  it("shows the warning of the last sync", async () => {
    const drive = new MemoryDrive();
    const sync = fakeSyncServices(drive, new MemorySyncStore(await syncedState(drive, [e(johnny, 1)], { notice: { kind: "other-files", count: 2 } })));
    await render({ path: "/reglages", entries: [e(johnny, 1)], services: { sync } });
    expect(card().textContent).toContain("Votre Drive contient 2 autres fichiers de collection Nova Preem.");
  });

  it("asks to sign in again once Google Drive is no longer authorized", async () => {
    const drive = new MemoryDrive();
    const sync = fakeSyncServices(drive, new MemorySyncStore(await syncedState(drive, [e(johnny, 1)], { token: null, lastError: "revoked" })));
    await render({ path: "/reglages", entries: [e(johnny, 1)], services: { sync } });
    expect(card().querySelector('[role="alert"]')?.textContent).toBe("Google Drive n'est plus autorisé. Reconnectez-vous pour reprendre la synchronisation.");
    await click(button("Synchroniser avec Google Drive"));
    // Same account: the base is kept, no first-sync question.
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(card().textContent).toContain("À jour");
  });

  it("disconnects after confirmation, keeping the collection and the file", async () => {
    const drive = new MemoryDrive();
    const sync = fakeSyncServices(drive, new MemorySyncStore(await syncedState(drive, [e(johnny, 1)])));
    const store = new MemoryCollectionStore();
    await render({ path: "/reglages", entries: [e(johnny, 1)], store, services: { sync } });
    await click(button("Se déconnecter"));
    const dialog = container.querySelector<HTMLElement>('[role="dialog"]')!;
    expect(dialog.textContent).toContain("La synchronisation s'arrête sur cet appareil.");
    await click(button("Se déconnecter", dialog));
    expect(card().textContent).toContain("Synchroniser avec Google Drive");
    expect(sync.store.state).toBeUndefined();
    expect(sync.auth.revoked).toEqual(["token"]);
    expect(drive.files.size).toBe(1);
  });

  it("uses the browser wording and shows the status pill on desktop", async () => {
    setViewportWidth(1280);
    const drive = new MemoryDrive();
    const sync = fakeSyncServices(drive, new MemorySyncStore(await syncedState(drive, [e(johnny, 1)])));
    await render({ path: "/reglages", entries: [e(johnny, 1), e(chrome, 1)], services: { sync } });
    expect(card().querySelector(".sync-pill")?.textContent).toBe("En attente · 1");
    await click(button("Se déconnecter"));
    expect(container.querySelector('[role="dialog"]')?.textContent).toContain("La synchronisation s'arrête dans ce navigateur.");
  });
});
