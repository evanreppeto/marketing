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
// HubSpot OAuth 2.0 (authorization-code) connect flow for `hubspot-import`.
//
// Unlike Higgsfield (a public PKCE client), HubSpot is a confidential client: the
// token exchange AND refresh both require the app's client_secret, which is a
// single deployment secret (HUBSPOT_CLIENT_ID / HUBSPOT_CLIENT_SECRET), never a
// per-workspace value. So the secret is injected from the environment at
// exchange/refresh time and is NEVER written into the stored per-workspace bundle.
//
// When the app credentials aren't configured the connector still works via a
// pasted private-app token (the historical path) — see resolveHubspotAccessToken.
// ---------------------------------------------------------------------------

export const HUBSPOT_OAUTH = {
  authorizeEndpoint: "https://app.hubspot.com/oauth/authorize",
  tokenEndpoint: "https://api.hubapi.com/oauth/v1/token",
  // Granular read scopes for the contacts/companies import. Must match the scopes
  // configured on the HubSpot app, or authorize returns an error.
  scopes: ["crm.objects.contacts.read", "crm.objects.companies.read"],
} as const;

export function hubspotOAuthClientId(): string | null {
  const v = process.env.HUBSPOT_CLIENT_ID?.trim();
  return v ? v : null;
}
function hubspotOAuthClientSecret(): string | null {
  const v = process.env.HUBSPOT_CLIENT_SECRET?.trim();
  return v ? v : null;
}

/** True when the deployment has a HubSpot app configured, so the OAuth button works. */
export function isHubspotOAuthConfigured(): boolean {
  return Boolean(hubspotOAuthClientId() && hubspotOAuthClientSecret());
}

/** Build the HubSpot authorize URL the operator's browser is redirected to. */
export function buildHubspotAuthorizeUrl(input: { clientId: string; redirectUri: string; state: string }): string {
  const params = new URLSearchParams({
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    scope: HUBSPOT_OAUTH.scopes.join(" "),
    state: input.state,
  });
  return `${HUBSPOT_OAUTH.authorizeEndpoint}?${params.toString()}`;
}

export type HubspotExchangeResult =
  | { ok: true; tokens: { accessToken: string; refreshToken: string; expiresAt: number } }
  | { ok: false; error: string };

/** Exchange an authorization code for tokens. Requires the app client secret. */
export async function exchangeHubspotCode(input: {
  code: string;
  redirectUri: string;
  fetchImpl?: typeof fetch;
  now?: number;
}): Promise<HubspotExchangeResult> {
  const clientId = hubspotOAuthClientId();
  const clientSecret = hubspotOAuthClientSecret();
  if (!clientId || !clientSecret) return { ok: false, error: "HubSpot OAuth is not configured." };

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: input.redirectUri,
    code: input.code,
  }).toString();

  const doFetch = input.fetchImpl ?? fetch;
  try {
    const res = await doFetch(HUBSPOT_OAUTH.tokenEndpoint, {
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
        expiresAt: now + (json.expires_in ?? 1800) * 1000,
      },
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "token exchange error" };
  }
}

/** Serialize the exchanged tokens into the stored OAuth bundle shape. */
export function buildHubspotBundle(tokens: { accessToken: string; refreshToken: string; expiresAt: number }, clientId: string): string {
  return serializeOAuthBundle({
    kind: "oauth_refresh",
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiresAt: tokens.expiresAt,
    clientId,
    tokenEndpoint: HUBSPOT_OAUTH.tokenEndpoint,
  });
}

type EnsureFreshResult =
  | { ok: true; accessToken: string }
  | { ok: false; error: string };

/**
 * Return a valid HubSpot access token, refreshing via the token endpoint (with the
 * app client_secret) when stale and best-effort-persisting the new bundle. Refresh
 * failure is surfaced so the caller can tell the operator to reconnect.
 */
async function ensureFreshHubspotToken(
  client: SupabaseClient,
  credentialRef: string | null,
  bundle: OAuthRefreshBundle,
  deps: { fetchImpl?: typeof fetch; now?: number } = {},
): Promise<EnsureFreshResult> {
  const now = deps.now ?? Date.now();
  if (!isAccessTokenStale(bundle, now)) return { ok: true, accessToken: bundle.accessToken };

  const clientSecret = hubspotOAuthClientSecret();
  if (!clientSecret) return { ok: false, error: "HubSpot OAuth is not configured (missing client secret) — reconnect." };

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
    // Best-effort persist of the rotated bundle — a write failure must not fail the
    // token resolution (we already have a valid fresh access token in hand).
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

export type ResolveHubspotTokenResult =
  | { ok: true; accessToken: string }
  | { ok: false; error: string };

/**
 * Resolve a usable HubSpot access token from the stored credential, transparently
 * handling BOTH connect paths: a pasted private-app token (bearer — used as-is) and
 * an OAuth bundle (refreshed when stale). This is the single entry point the import
 * and the Test button use so neither has to know which path a workspace connected by.
 */
export async function resolveHubspotAccessToken(
  client: SupabaseClient,
  credentialRef: string | null,
  rawCredential: string,
  deps: { fetchImpl?: typeof fetch; now?: number } = {},
): Promise<ResolveHubspotTokenResult> {
  const parsed = parseConnectorCredential(rawCredential);
  if (parsed.kind === "bearer") return { ok: true, accessToken: parsed.token };
  return ensureFreshHubspotToken(client, credentialRef, parsed, deps);
}
