import type { CollectionEntry } from "../src/domain/collection.ts";
import { buildCollectionFile, serializeCollectionFile, type FileSettings } from "../src/domain/collectionFile.ts";
import type { SyncStore } from "../src/domain/stores.ts";
import type { SyncState } from "../src/domain/sync.ts";
import { AuthError, RemoteError, type AccessToken, type RemoteFileProvider, type RemoteFileRef, type SyncAuth } from "../src/domain/syncEngine.ts";
import type { SyncServices } from "../src/platform/services.ts";

const T1 = "2026-10-20T10:00:00.000Z";
export const SYNC_SETTINGS: FileSettings = { entryReleaseId: "wnc-retail", entryLanguage: "fr", duplicateThreshold: 1, completionGroups: ["main", "starter"], cardNameLanguage: "entry" };

/** Google Drive in memory: files with a version that changes on every write. */
export class MemoryDrive implements RemoteFileProvider {
  files = new Map<string, { text: string; version: number; trashed: boolean }>();
  writes = 0;
  failNextUpdate: RemoteError | null = null;
  private nextId = 1;

  async find(knownId: string | null) {
    const live = [...this.files].filter(([, file]) => !file.trashed);
    const known = live.find(([id]) => id === knownId) ?? live[0];
    // Like Google Drive: every file is searched, the known one first, otherwise the oldest.
    return { file: known && this.ref(known[0]), others: Math.max(0, live.length - 1) };
  }
  async download(file: RemoteFileRef) {
    const stored = this.files.get(file.id)!;
    return { text: stored.text, version: String(stored.version) };
  }
  async create(text: string) {
    const id = `file-${this.nextId++}`;
    this.files.set(id, { text, version: 1, trashed: false });
    this.writes++;
    return this.ref(id);
  }
  async update(file: RemoteFileRef, text: string) {
    if (this.failNextUpdate) {
      const error = this.failNextUpdate;
      this.failNextUpdate = null;
      throw error;
    }
    const stored = this.files.get(file.id)!;
    if (String(stored.version) !== file.version) throw new RemoteError("changed");
    stored.text = text;
    stored.version++;
    this.writes++;
    return this.ref(file.id);
  }
  put(entries: CollectionEntry[], settings: Partial<FileSettings> = SYNC_SETTINGS) {
    const file = buildCollectionFile({ entries, settings: SYNC_SETTINGS, appVersion: "0.1.0", catalogVersion: "x", now: T1 });
    return this.create(serializeCollectionFile({ ...file, settings }));
  }
  entriesOf(id: string) {
    return (JSON.parse(this.files.get(id)!.text) as { entries: CollectionEntry[] }).entries;
  }
  private ref(id: string): RemoteFileRef {
    return { id, version: String(this.files.get(id)!.version) };
  }
}

export class MemorySyncStore implements SyncStore {
  constructor(public state: SyncState | undefined = undefined) {}
  async load() {
    return this.state;
  }
  async save(state: SyncState) {
    this.state = state;
  }
  async clear() {
    this.state = undefined;
  }
}

/** Google sign-in that answers at once: a token, or the given error. */
export class FakeAuth implements SyncAuth {
  failWith: AuthError | null = null;
  revoked: string[] = [];
  constructor(public account: string | null = "someone@example.com") {}
  prepare() {}
  async authorize() {
    if (this.failWith) throw this.failWith;
    const token: AccessToken = { value: "token", expiresAt: new Date(Date.now() + 3_600_000).toISOString() };
    return { token, account: this.account };
  }
  async revoke(token: string) {
    this.revoked.push(token);
  }
}

export function fakeSyncServices(drive = new MemoryDrive(), store = new MemorySyncStore(), auth = new FakeAuth()): SyncServices & { drive: MemoryDrive; store: MemorySyncStore; auth: FakeAuth } {
  return { drive, store, auth, remote: () => drive, fileUrl: (id) => `https://drive.example/${id}` };
}
