import { createHash, randomBytes } from "node:crypto";

/**
 * In-app OAuth for the Higgsfield remote-MCP connector. Higgsfield runs a
 * standard OAuth 2.0 / OIDC server (discovery at
 * https://mcp.higgsfield.ai/.well-known/oauth-authorization-server) supporting
 * dynamic client registration, PKCE (S256), and the authorization_code +
 * refresh_token grants with public clients ("none" auth method). This module is
 * the server-side half of the "Connect Higgsfield" button: register a client,
 * build the PKCE authorize URL, and exchange the returned code for a token
 * bundle. The bundle is stored via the SAME serializeOAuthBundle format the
 * runner reads and oauth-refresh.ts auto-renews — so nothing downstream changes.
 *
 * Long-term this whole connector moves to direct API calls; keep the OAuth flow
 * self-contained here so that swap stays a deletion, not a refactor.
 */

export const HIGGSFIELD_OAUTH = {
  authorizeEndpoint: "https://mcp.higgsfield.ai/oauth2/authorize",
  tokenEndpoint: "https://mcp.higgsfield.ai/oauth2/token",
  registrationEndpoint: "https://mcp.higgsfield.ai/oauth2/register",
  // offline_access is what yields a refresh token (→ server-side auto-renew).
  scope: "openid email offline_access",
} as const;

const base64url = (buf: Buffer): string => buf.toString("base64url");

/** PKCE pair: a high-entropy verifier and its S256 challenge. */
export function generatePkce(): { verifier: string; challenge: string } {
  const verifier = base64url(randomBytes(32));
  const challenge = base64url(createHash("sha256").update(verifier).digest());
  return { verifier, challenge };
}

/** Opaque anti-CSRF state value carried through the redirect. */
export function generateState(): string {
  return base64url(randomBytes(16));
}

/** Build the authorization redirect URL (pure — unit-tested). */
export function buildAuthorizeUrl(input: {
  clientId: string;
  redirectUri: string;
  challenge: string;
  state: string;
}): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    scope: HIGGSFIELD_OAUTH.scope,
    code_challenge: input.challenge,
    code_challenge_method: "S256",
    state: input.state,
  });
  return `${HIGGSFIELD_OAUTH.authorizeEndpoint}?${params.toString()}`;
}

/** Body for the authorization_code → token exchange (pure — unit-tested). */
export function buildCodeExchangeBody(input: {
  code: string;
  redirectUri: string;
  clientId: string;
  verifier: string;
}): string {
  return new URLSearchParams({
    grant_type: "authorization_code",
    code: input.code,
    redirect_uri: input.redirectUri,
    client_id: input.clientId,
    code_verifier: input.verifier,
  }).toString();
}

/**
 * Dynamic client registration → a fresh public client_id for this workspace's
 * connect attempt. Public client (no secret): token_endpoint_auth_method "none".
 */
export async function registerClient(redirectUri: string, clientName: string): Promise<{ ok: true; clientId: string } | { ok: false; error: string }> {
  try {
    const res = await fetch(HIGGSFIELD_OAUTH.registrationEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        client_name: clientName,
        redirect_uris: [redirectUri],
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        token_endpoint_auth_method: "none",
        scope: HIGGSFIELD_OAUTH.scope,
      }),
    });
    if (!res.ok) return { ok: false, error: `registration failed (${res.status}): ${(await res.text().catch(() => "")).slice(0, 160)}` };
    const json = (await res.json()) as { client_id?: string };
    if (!json.client_id) return { ok: false, error: "registration response missing client_id" };
    return { ok: true, clientId: json.client_id };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "registration error" };
  }
}

export type HiggsfieldTokens = { accessToken: string; refreshToken: string; expiresAt: number };

/** Exchange the authorization code for tokens. */
export async function exchangeCode(input: {
  code: string;
  redirectUri: string;
  clientId: string;
  verifier: string;
}): Promise<{ ok: true; tokens: HiggsfieldTokens } | { ok: false; error: string }> {
  try {
    const res = await fetch(HIGGSFIELD_OAUTH.tokenEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: buildCodeExchangeBody(input),
    });
    if (!res.ok) return { ok: false, error: `token exchange failed (${res.status}): ${(await res.text().catch(() => "")).slice(0, 160)}` };
    const json = (await res.json()) as { access_token?: string; refresh_token?: string; expires_in?: number };
    if (!json.access_token || !json.refresh_token) {
      return { ok: false, error: "token response missing access_token or refresh_token (need offline_access for a refresh token)" };
    }
    return {
      ok: true,
      tokens: {
        accessToken: json.access_token,
        refreshToken: json.refresh_token,
        expiresAt: Date.now() + (json.expires_in ?? 86_400) * 1000,
      },
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "token exchange error" };
  }
}
