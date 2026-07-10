import { randomBytes } from "node:crypto";

/**
 * In-app OAuth for the HubSpot CRM import connector (`hubspot-import`). HubSpot is
 * a CONFIDENTIAL OAuth 2.0 client: a single platform app identified by a
 * `HUBSPOT_CLIENT_ID` + `HUBSPOT_CLIENT_SECRET` — NOT dynamic client registration
 * and NOT PKCE. This module is the server-side half of the "Connect with HubSpot"
 * button: build the authorize URL, and exchange the returned code for a token
 * bundle (sending the client secret). The bundle is stored via the SAME
 * serializeOAuthBundle format that oauth-refresh.ts auto-renews — the only
 * difference from the public Higgsfield flow is that the stored bundle carries a
 * `clientSecret`, which the shared refresh path adds to the refresh body.
 *
 * The import engine (`hubspotCrmImportSource` / `checkHubspotConnection`) is
 * unchanged: it still consumes a plain access token; resolving the stored bundle
 * to a fresh token happens at the call sites via resolveConnectorAccessToken.
 */

export const HUBSPOT_OAUTH = {
  authorizeEndpoint: "https://app.hubspot.com/oauth/authorize",
  tokenEndpoint: "https://api.hubapi.com/oauth/v1/token",
  // Space-delimited. Read-only CRM object scopes + `oauth` (required to install).
  scope: "oauth crm.objects.contacts.read crm.objects.companies.read crm.objects.deals.read",
} as const;

// HubSpot access tokens are short-lived (~30 min); the response always includes
// expires_in, so this fallback is only a safety net.
const DEFAULT_TTL_S = 1_800;

/** Opaque anti-CSRF state value carried through the redirect (no PKCE for HubSpot). */
export function generateState(): string {
  return randomBytes(16).toString("base64url");
}

/** Build the HubSpot install/authorize redirect URL (pure — unit-tested). */
export function buildAuthorizeUrl(input: { clientId: string; redirectUri: string; state: string }): string {
  const params = new URLSearchParams({
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    scope: HUBSPOT_OAUTH.scope,
    state: input.state,
  });
  return `${HUBSPOT_OAUTH.authorizeEndpoint}?${params.toString()}`;
}

/** Body for the authorization_code → token exchange (pure — unit-tested). Confidential:
 *  includes client_secret. */
export function buildCodeExchangeBody(input: {
  code: string;
  redirectUri: string;
  clientId: string;
  clientSecret: string;
}): string {
  return new URLSearchParams({
    grant_type: "authorization_code",
    client_id: input.clientId,
    client_secret: input.clientSecret,
    redirect_uri: input.redirectUri,
    code: input.code,
  }).toString();
}

export type HubspotTokens = { accessToken: string; refreshToken: string; expiresAt: number };

/** Exchange the authorization code for tokens (form POST incl. client_secret). */
export async function exchangeCode(input: {
  code: string;
  redirectUri: string;
  clientId: string;
  clientSecret: string;
  /** Injected for tests; defaults to global fetch. */
  fetchImpl?: typeof fetch;
}): Promise<{ ok: true; tokens: HubspotTokens } | { ok: false; error: string }> {
  const doFetch = input.fetchImpl ?? fetch;
  try {
    const res = await doFetch(HUBSPOT_OAUTH.tokenEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: buildCodeExchangeBody(input),
    });
    if (!res.ok) {
      return { ok: false, error: `token exchange failed (${res.status}): ${(await res.text().catch(() => "")).slice(0, 160)}` };
    }
    const json = (await res.json()) as { access_token?: string; refresh_token?: string; expires_in?: number };
    if (!json.access_token || !json.refresh_token) {
      return { ok: false, error: "token response missing access_token or refresh_token" };
    }
    return {
      ok: true,
      tokens: {
        accessToken: json.access_token,
        refreshToken: json.refresh_token,
        expiresAt: Date.now() + (json.expires_in ?? DEFAULT_TTL_S) * 1000,
      },
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "token exchange error" };
  }
}
