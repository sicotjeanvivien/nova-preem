import { describe, expect, it } from "vitest";
import type { CollectionEntry } from "../../src/domain/collection.ts";
import { buildCollectionFile, serializeCollectionFile, type FileSettings } from "../../src/domain/collectionFile.ts";
import { connectedState, type SyncContent, type SyncState } from "../../src/domain/sync.ts";
import { RemoteError, synchronize, type RemoteFileProvider } from "../../src/domain/syncEngine.ts";
import { MemoryDrive } from "../helpers-sync.ts";

const T1 = "2026-10-20T10:00:00.000Z";
const NOW = "2026-10-30T10:00:00.000Z";
const e = (printingId: string, quantity: number): CollectionEntry => ({ printingId, quantity, firstAddedAt: T1, lastAddedAt: T1 });
const SETTINGS: FileSettings = { entryReleaseId: "wnc-retail", entryLanguage: "fr", duplicateThreshold: 1, completionGroups: ["main", "starter"], cardNameLanguage: "entry" };
const content = (...entries: CollectionEntry[]): SyncContent => ({ entries, settings: SETTINGS });
const context = { appVersion: "0.2.0", catalogVersion: "2026-10-26.5", now: NOW };
const fresh = (): SyncState => connectedState("someone@example.com", { value: "token", expiresAt: "2026-10-30T11:00:00.000Z" });

/** A device: its collection and its sync state, synced like the app does (applying the result). */
class Device {
  state = fresh();
  constructor(public local: SyncContent) {}
  async sync(drive: RemoteFileProvider) {
    const outcome = await synchronize(drive, this.state, this.local, context, "merge");
    this.state = outcome.state;
    if (outcome.kind === "done") this.local = outcome.content;
    return outcome;
  }
}

describe("first sync of a device (sync spec §3.3)", () => {
  it("creates the file from the device when Drive has none", async () => {
    const drive = new MemoryDrive();
    const outcome = await synchronize(drive, fresh(), content(e("a", 2)), context);
    expect(outcome).toMatchObject({ kind: "done", content: content(e("a", 2)), state: { fileId: "file-1", baseVersion: "1", lastSyncAt: NOW, notice: null } });
    expect(drive.entriesOf("file-1")).toEqual([e("a", 2)]);
  });

  it("takes the file when the device is empty, without writing it again", async () => {
    const drive = new MemoryDrive();
    await drive.put([e("a", 1)]);
    const outcome = await synchronize(drive, fresh(), content(), context);
    expect(outcome).toMatchObject({ kind: "done", content: content(e("a", 1)) });
    expect(drive.writes).toBe(1);
  });

  it("asks when both sides hold a collection, then applies the choice", async () => {
    const drive = new MemoryDrive();
    await drive.put([e("a", 1), e("b", 3)]);
    const local = content(e("a", 2));
    const asked = await synchronize(drive, fresh(), local, context);
    expect(asked).toMatchObject({ kind: "ask", remote: { entries: [e("a", 1), e("b", 3)] }, remoteDate: T1, state: { fileId: "file-1", base: null } });
    expect(drive.writes).toBe(1);

    const merged = await synchronize(drive, asked.state, local, context, "merge");
    expect(merged).toMatchObject({ kind: "done", content: content(e("a", 2), e("b", 3)) });
    expect(drive.entriesOf("file-1")).toEqual([e("a", 2), e("b", 3)]);
  });

  it("writes the file's missing settings", async () => {
    const drive = new MemoryDrive();
    await drive.put([e("a", 1)], {});
    await synchronize(drive, fresh(), content(), context);
    expect(drive.writes).toBe(2);
  });
});

describe("two devices (sync spec §10, step 2 criterion)", () => {
  it("an addition on one appears on the other, a removal disappears", async () => {
    const drive = new MemoryDrive();
    const phone = new Device(content(e("a", 1), e("b", 2)));
    const pc = new Device(content());
    await phone.sync(drive);
    await pc.sync(drive);
    expect(pc.local).toEqual(phone.local);

    phone.local = content(e("a", 2), e("b", 2), e("c", 1));
    await phone.sync(drive);
    await pc.sync(drive);
    expect(pc.local).toEqual(content(e("a", 2), e("b", 2), e("c", 1)));

    pc.local = content(e("a", 2), e("c", 1));
    await pc.sync(drive);
    await phone.sync(drive);
    expect(phone.local).toEqual(content(e("a", 2), e("c", 1)));
  });

  it("converges when both changed offline: additions add up, removals stay", async () => {
    const drive = new MemoryDrive();
    const phone = new Device(content(e("a", 1), e("b", 2)));
    const pc = new Device(content());
    await phone.sync(drive);
    await pc.sync(drive);

    phone.local = content(e("a", 2), e("b", 2));
    pc.local = content(e("a", 2));
    await phone.sync(drive);
    await pc.sync(drive);
    await phone.sync(drive);
    expect(phone.local).toEqual(content(e("a", 3)));
    expect(pc.local).toEqual(phone.local);
  });

  it("does not write the file when nothing changed", async () => {
    const drive = new MemoryDrive();
    const phone = new Device(content(e("a", 1)));
    await phone.sync(drive);
    await phone.sync(drive);
    expect(drive.writes).toBe(1);
  });

  it("starts again when the file changed between download and upload", async () => {
    const drive = new MemoryDrive();
    const phone = new Device(content(e("a", 1)));
    await phone.sync(drive);
    phone.local = content(e("a", 2));
    drive.failNextUpdate = new RemoteError("changed");
    expect(await phone.sync(drive)).toMatchObject({ kind: "done" });
    expect(drive.entriesOf("file-1")).toEqual([e("a", 2)]);
  });
});

describe("errors (sync spec §7)", () => {
  async function synced(drive: MemoryDrive) {
    const device = new Device(content(e("a", 1)));
    await device.sync(drive);
    return device;
  }

  it("recreates a file deleted or trashed in Drive, and says so", async () => {
    const drive = new MemoryDrive();
    const device = await synced(drive);
    drive.files.get("file-1")!.trashed = true;
    expect(await device.sync(drive)).toMatchObject({ kind: "done", state: { fileId: "file-2", notice: { kind: "recreated" } } });
    expect(drive.entriesOf("file-2")).toEqual([e("a", 1)]);
  });

  it("uses the oldest of several files and reports the others", async () => {
    const drive = new MemoryDrive();
    await drive.put([e("a", 1)]);
    await drive.put([e("z", 1)]);
    await drive.put([e("z", 1)]);
    expect(await new Device(content()).sync(drive)).toMatchObject({ kind: "done", content: content(e("a", 1)), state: { fileId: "file-1", notice: { kind: "other-files", count: 2 } } });
  });

  it("writes nothing when the file is invalid", async () => {
    const drive = new MemoryDrive();
    const device = await synced(drive);
    drive.files.get("file-1")!.text = "{ not json";
    device.local = content(e("a", 5));
    expect(await device.sync(drive)).toMatchObject({ kind: "failed", state: { lastError: "invalid-file" } });
    expect(device.local).toEqual(content(e("a", 5)));
    expect(drive.files.get("file-1")!.text).toBe("{ not json");
  });

  it("keeps a full Drive as an error, a refused token as a pause, a network failure as pending", async () => {
    const drive = new MemoryDrive();
    const device = await synced(drive);
    device.local = content(e("a", 2));
    const before = device.state;
    for (const [code, expected] of [
      ["storage-full", { ...before, lastError: "storage-full" }],
      ["unauthorized", { ...before, token: null }],
      ["network", before],
    ] as const) {
      drive.failNextUpdate = new RemoteError(code);
      expect(await synchronize(drive, before, device.local, context)).toEqual({ kind: "failed", state: expected });
    }
  });

  it("clears a lasting error once a sync succeeds", async () => {
    const drive = new MemoryDrive();
    const device = await synced(drive);
    device.state = { ...device.state, lastError: "storage-full" };
    device.local = content(e("a", 2));
    expect(await device.sync(drive)).toMatchObject({ kind: "done", state: { lastError: null } });
  });
});
