import { AuthError, type SyncAuth } from "../domain/syncEngine.ts";

// Google Identity Services, token model (docs/sync-spec.md §4.1): no backend,
// an access token valid one hour, renewed through Google's pop-up.

const SCRIPT_URL = "https://accounts.google.com/gsi/client";
export const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
const SCOPES = [DRIVE_SCOPE, "openid", "email"].join(" ");

interface TokenResponse {
  access_token?: string;
  expires_in?: number | string;
  error?: string;
}

interface TokenClient {
  requestAccessToken(overrides?: { prompt?: string; login_hint?: string }): void;
}

interface GoogleOAuth2 {
  initTokenClient(config: {
    client_id: string;
    scope: string;
    callback: (response: TokenResponse) => void;
    error_callback?: (error: { type: string }) => void;
  }): TokenClient;
  hasGrantedAllScopes(response: TokenResponse, ...scopes: string[]): boolean;
  revoke(token: string, done?: () => void): void;
}

declare global {
  interface Window {
    google?: { accounts: { oauth2: GoogleOAuth2 } };
  }
}

let loading: Promise<GoogleOAuth2> | null = null;

/** Loads the Google library once, only when sync is used. */
function loadGoogle(): Promise<GoogleOAuth2> {
  loading ??= new Promise<GoogleOAuth2>((resolve, reject) => {
    if (window.google?.accounts.oauth2) return resolve(window.google.accounts.oauth2);
    const script = document.createElement("script");
    script.src = SCRIPT_URL;
    script.async = true;
    script.onload = () => (window.google ? resolve(window.google.accounts.oauth2) : reject(new AuthError("unavailable")));
    script.onerror = () => reject(new AuthError("unavailable", "Google Identity Services could not be loaded"));
    document.head.append(script);
  }).catch((error: unknown) => {
    loading = null;
    throw error;
  });
  return loading;
}

export class GoogleAuth implements SyncAuth {
  constructor(private readonly clientId: string) {}

  prepare() {
    loadGoogle().catch((error: unknown) => console.warn("Google sign-in unavailable", error));
  }

  async authorize(hint: string | null) {
    const oauth2 = await loadGoogle();
    const response = await new Promise<TokenResponse>((resolve, reject) => {
      const client = oauth2.initTokenClient({
        client_id: this.clientId,
        scope: SCOPES,
        callback: resolve,
        // The pop-up was closed, or blocked by the browser.
        error_callback: (error) => reject(new AuthError("cancelled", error.type)),
      });
      client.requestAccessToken({ prompt: "", ...(hint ? { login_hint: hint } : {}) });
    });
    // Google lets the user untick Drive on the consent screen: without it, nothing to sync.
    if (response.error || !response.access_token || !oauth2.hasGrantedAllScopes(response, DRIVE_SCOPE)) {
      throw new AuthError("denied", response.error ?? "drive.file not granted");
    }
    const expiresAt = new Date(Date.now() + Number(response.expires_in ?? 3600) * 1000).toISOString();
    return { token: { value: response.access_token, expiresAt }, account: await accountEmail(response.access_token) };
  }

  async revoke(token: string) {
    const oauth2 = await loadGoogle();
    await new Promise<void>((resolve) => oauth2.revoke(token, resolve));
  }
}

/** E-mail of the connected account, shown in Settings; null if it cannot be read. */
async function accountEmail(token: string): Promise<string | null> {
  try {
    const response = await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) return null;
    const body = (await response.json()) as { email?: unknown };
    return typeof body.email === "string" ? body.email : null;
  } catch {
    return null;
  }
}
