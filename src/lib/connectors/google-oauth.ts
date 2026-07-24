import { type SupabaseClient } from "@supabase/supabase-js";

import {
  applyRefreshResponse,
  isAccessTokenStale,
  parseConnectorCredential,
  serializeOAuthBundle,
  type OAuthRefreshBundle,
  type OAuthTokenResponse,
} from "@/domain";

import { updateConnectorCredential } from "./credentials";

// ---------------------------------------------------------------------------
// Google OAuth 2.0 (authorization-code) for the `reviews-signals` connector
// (Google Business Profile). Confidential client: exchange + refresh both need
// the app client_secret (a single deployment secret, never per-workspace).
//
// Google only returns a refresh_token when access_type=offline AND the user is
// forced through consent, so buildGoogleAuthorizeUrl sets prompt=consent. When
// the app credentials aren't configured the connector stays `planned`-like
// (unconnectable) — there is no paste fallback for Google review access.
// ---------------------------------------------------------------------------

export const GOOGLE_OAUTH = {
  authorizeEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
  tokenEndpoint: "https://oauth2.googleapis.com/token",
  // Read/manage scope for the Business Profile (reviews) APIs.
  scopes: ["https://www.googleapis.com/auth/business.manage"],
} as const;

export function googleOAuthClientId(): string | null {
  const v = process.env.GOOGLE_CLIENT_ID?.trim();
  return v ? v : null;
}
function googleOAuthClientSecret(): string | null {
  const v = process.env.GOOGLE_CLIENT_SECRET?.trim();
  return v ? v : null;
}

/** True when the deployment has a Google app configured, so the OAuth button works. */
export function isGoogleOAuthConfigured(): boolean {
  return Boolean(googleOAuthClientId() && googleOAuthClientSecret());
}

/** Build the Google authorize URL. offline + consent so a refresh_token comes back. */
export function buildGoogleAuthorizeUrl(input: { clientId: string; redirectUri: string; state: string }): string {
  const params = new URLSearchParams({
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    response_type: "code",
    scope: GOOGLE_OAUTH.scopes.join(" "),
    access_type: "offline",
    prompt: "consent",
    state: input.state,
  });
  return `${GOOGLE_OAUTH.authorizeEndpoint}?${params.toString()}`;
}

export type GoogleExchangeResult =
  | { ok: true; tokens: { accessToken: string; refreshToken: string; expiresAt: number } }
  | { ok: false; error: string };

/** Exchange an authorization code for tokens. Requires the app client secret. */
export async function exchangeGoogleCode(input: {
  code: string;
  redirectUri: string;
  fetchImpl?: typeof fetch;
  now?: number;
}): Promise<GoogleExchangeResult> {
  const clientId = googleOAuthClientId();
  const clientSecret = googleOAuthClientSecret();
  if (!clientId || !clientSecret) return { ok: false, error: "Google OAuth is not configured." };

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: input.redirectUri,
    code: input.code,
  }).toString();

  const doFetch = input.fetchImpl ?? fetch;
  try {
    const res = await doFetch(GOOGLE_OAUTH.tokenEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body,
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return { ok: false, error: `token exchange failed (${res.status}): ${detail.slice(0, 200)}` };
    }
    const json = (await res.json()) as OAuthTokenResponse;
    if (!json.access_token || !json.refresh_token) {
      return { ok: false, error: "token response missing access_token/refresh_token" };
    }
    const now = input.now ?? Date.now();
    return {
      ok: true,
      tokens: {
        accessToken: json.access_token,
        refreshToken: json.refresh_token,
        expiresAt: now + (json.expires_in ?? 3600) * 1000,
      },
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "token exchange error" };
  }
}

/** Serialize the exchanged tokens into the stored OAuth bundle shape. */
export function buildGoogleBundle(tokens: { accessToken: string; refreshToken: string; expiresAt: number }, clientId: string): string {
  return serializeOAuthBundle({
    kind: "oauth_refresh",
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiresAt: tokens.expiresAt,
    clientId,
    tokenEndpoint: GOOGLE_OAUTH.tokenEndpoint,
  });
}

export type ResolveGoogleTokenResult =
  | { ok: true; accessToken: string }
  | { ok: false; error: string };

/**
 * Resolve a usable Google access token from the stored credential (always an OAuth
 * bundle for Google — there is no pasted-token path), refreshing it via the token
 * endpoint (with the app client_secret) when stale and best-effort-persisting the
 * rotated bundle. A refresh failure surfaces so the caller can prompt a reconnect.
 */
export async function resolveGoogleAccessToken(
  client: SupabaseClient,
  credentialRef: string | null,
  rawCredential: string,
  deps: { fetchImpl?: typeof fetch; now?: number } = {},
): Promise<ResolveGoogleTokenResult> {
  const parsed = parseConnectorCredential(rawCredential);
  if (parsed.kind === "bearer") {
    // A bare token can't be refreshed; use it directly (a manually-provisioned token).
    return { ok: true, accessToken: parsed.token };
  }
  return ensureFreshGoogleToken(client, credentialRef, parsed, deps);
}

async function ensureFreshGoogleToken(
  client: SupabaseClient,
  credentialRef: string | null,
  bundle: OAuthRefreshBundle,
  deps: { fetchImpl?: typeof fetch; now?: number } = {},
): Promise<ResolveGoogleTokenResult> {
  const now = deps.now ?? Date.now();
  if (!isAccessTokenStale(bundle, now)) return { ok: true, accessToken: bundle.accessToken };

  const clientSecret = googleOAuthClientSecret();
  if (!clientSecret) return { ok: false, error: "Google OAuth is not configured (missing client secret) — reconnect." };

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: bundle.clientId,
    client_secret: clientSecret,
    refresh_token: bundle.refreshToken,
  }).toString();

  const doFetch = deps.fetchImpl ?? fetch;
  try {
    const res = await doFetch(bundle.tokenEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body,
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return { ok: false, error: `refresh failed (${res.status}): ${detail.slice(0, 160)}` };
    }
    const json = (await res.json()) as OAuthTokenResponse;
    if (!json.access_token) return { ok: false, error: "refresh response missing access_token" };
    const next = applyRefreshResponse(bundle, json, Date.now());
    // Best-effort persist — a write failure must not fail token resolution.
    try {
      await updateConnectorCredential(client, credentialRef, serializeOAuthBundle(next));
    } catch {
      /* keep going with the fresh token */
    }
    return { ok: true, accessToken: next.accessToken };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "refresh error" };
  }
}
