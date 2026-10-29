import { RemoteError, type RemoteFileProvider, type RemoteFileRef } from "../domain/syncEngine.ts";

// The collection file in Google Drive (docs/sync-spec.md §2), REST API v3
// with fetch. Scope drive.file: only the files this app created are visible.

const API = "https://www.googleapis.com/drive/v3/files";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3/files";
export const FILE_NAME = "nova-preem-collection.json";
const FOLDER_NAME = "Nova Preem";
const MARK = "novaPreem";
const FOLDER_MIME = "application/vnd.google-apps.folder";

/** Link to the file in Drive (Settings, "Voir le fichier dans Drive"). */
export function driveFileUrl(fileId: string): string {
  return `https://drive.google.com/file/d/${encodeURIComponent(fileId)}/view`;
}

export class GoogleDriveFiles implements RemoteFileProvider {
  constructor(private readonly token: string) {}

  async find(knownId: string | null) {
    // Searched every time: the file may have been moved, trashed, or duplicated by another device.
    const files = await this.#marked("collection");
    const file = files.find((candidate) => candidate.id === knownId) ?? files[0];
    return { file, others: Math.max(0, files.length - 1) };
  }

  async download(file: RemoteFileRef) {
    // Version first: if the file changes in between, the upload's check fails and the sync starts again.
    const version = await this.#version(file.id);
    const response = await this.#fetch(`${API}/${encodeURIComponent(file.id)}?alt=media`);
    return { text: await response.text(), version };
  }

  async create(text: string): Promise<RemoteFileRef> {
    const folder = (await this.#marked("folder"))[0] ?? (await this.#createFolder());
    const metadata = { name: FILE_NAME, mimeType: "application/json", parents: [folder.id], appProperties: { [MARK]: "collection" } };
    const boundary = `nova-preem-${crypto.randomUUID()}`;
    const body = [
      `--${boundary}`,
      "Content-Type: application/json; charset=UTF-8",
      "",
      JSON.stringify(metadata),
      `--${boundary}`,
      "Content-Type: application/json; charset=UTF-8",
      "",
      text,
      `--${boundary}--`,
      "",
    ].join("\r\n");
    const response = await this.#fetch(`${UPLOAD}?uploadType=multipart&fields=id,version`, {
      method: "POST",
      headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
      body,
    });
    return toRef(await response.json());
  }

  async update(file: RemoteFileRef, text: string): Promise<RemoteFileRef> {
    // The version is checked just before writing (sync spec §5.2, step 4).
    if ((await this.#version(file.id)) !== file.version) throw new RemoteError("changed");
    const response = await this.#fetch(`${UPLOAD}/${encodeURIComponent(file.id)}?uploadType=media&fields=id,version`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json; charset=UTF-8" },
      body: text,
    });
    return toRef(await response.json());
  }

  /** Files (or folders) marked by the app, not trashed, oldest first. */
  async #marked(kind: "collection" | "folder"): Promise<RemoteFileRef[]> {
    const query = `appProperties has { key='${MARK}' and value='${kind}' } and trashed = false`;
    const params = new URLSearchParams({ q: query, orderBy: "createdTime", fields: "files(id,version)", spaces: "drive", pageSize: "20" });
    const response = await this.#fetch(`${API}?${params}`);
    const body = (await response.json()) as { files?: unknown[] };
    return (body.files ?? []).map(toRef);
  }

  async #createFolder(): Promise<RemoteFileRef> {
    const response = await this.#fetch(`${API}?fields=id,version`, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=UTF-8" },
      body: JSON.stringify({ name: FOLDER_NAME, mimeType: FOLDER_MIME, appProperties: { [MARK]: "folder" } }),
    });
    return toRef(await response.json());
  }

  async #version(id: string): Promise<string> {
    const response = await this.#fetch(`${API}/${encodeURIComponent(id)}?fields=id,version`);
    return toRef(await response.json()).version;
  }

  async #fetch(url: string, init: RequestInit = {}): Promise<Response> {
    let response: Response;
    try {
      response = await fetch(url, { ...init, headers: { ...init.headers, Authorization: `Bearer ${this.token}` } });
    } catch (error) {
      throw new RemoteError("network", String(error));
    }
    if (response.ok) return response;
    throw new RemoteError(await errorCode(response), `Google Drive: HTTP ${response.status}`);
  }
}

function toRef(value: unknown): RemoteFileRef {
  const file = value as { id?: unknown; version?: unknown };
  if (typeof file.id !== "string") throw new RemoteError("network", "Google Drive: unexpected response");
  return { id: file.id, version: String(file.version ?? "") };
}

/** Drive errors (sync spec §7): https://developers.google.com/drive/api/guides/handle-errors */
async function errorCode(response: Response): Promise<RemoteError["code"]> {
  if (response.status === 401) return "unauthorized";
  if (response.status === 404) return "not-found";
  if (response.status === 403) {
    const body = (await response.json().catch(() => ({}))) as { error?: { errors?: { reason?: string }[] } };
    const reason = body.error?.errors?.[0]?.reason;
    if (reason === "storageQuotaExceeded") return "storage-full";
    if (reason === "insufficientPermissions" || reason === "forbidden") return "unauthorized";
  }
  // 403 rate limits, 429, 5xx: retried later.
  return "network";
}
