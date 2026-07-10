/**
 * Pure model + math for refreshable OAuth connector credentials. No I/O.
 *
 * A stored connector credential is either a bare bearer string (legacy / manually
 * pasted, not refreshable) or a JSON "oauth_refresh" bundle carrying the refresh
 * token + token endpoint so the access token can be auto-renewed server-side.
 */

export type OAuthRefreshBundle = {
  kind: "oauth_refresh";
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // epoch ms
  clientId: string;
  tokenEndpoint: string;
  /**
   * Optional client secret for CONFIDENTIAL OAuth clients (e.g. HubSpot), whose
   * token endpoint requires `client_secret` on refresh. PUBLIC PKCE clients (e.g.
   * Higgsfield) omit it entirely — the field is absent from their stored JSON and
   * their refresh body is byte-for-byte unchanged.
   */
  clientSecret?: string;
};

export type ConnectorCredential = { kind: "bearer"; token: string } | OAuthRefreshBundle;

const DEFAULT_SKEW_MS = 120_000; // refresh 2 min before expiry
const DEFAULT_TTL_S = 86_400; // 24h, when the token response omits expires_in

/** Parse a stored credential. Bundles are JSON with type:"oauth_refresh"; anything
 *  else (bare token, malformed JSON, other JSON) is treated as a bearer string. */
export function parseConnectorCredential(raw: string): ConnectorCredential {
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    if (o && o.type === "oauth_refresh") {
      const bundle: OAuthRefreshBundle = {
        kind: "oauth_refresh",
        accessToken: String(o.accessToken ?? ""),
        refreshToken: String(o.refreshToken ?? ""),
        expiresAt: Number(o.expiresAt ?? 0),
        clientId: String(o.clientId ?? ""),
        tokenEndpoint: String(o.tokenEndpoint ?? ""),
      };
      // Confidential clients only — absent for public PKCE bundles, so the key is
      // never added and those bundles round-trip identically.
      if (typeof o.clientSecret === "string" && o.clientSecret) bundle.clientSecret = o.clientSecret;
      return bundle;
    }
  } catch {
    // not JSON — fall through to bearer
  }
  return { kind: "bearer", token: raw };
}

export function isAccessTokenStale(c: { expiresAt: number }, nowMs: number, skewMs = DEFAULT_SKEW_MS): boolean {
  return c.expiresAt - nowMs <= skewMs;
}

export function buildRefreshRequest(
  c: Pick<OAuthRefreshBundle, "tokenEndpoint" | "refreshToken" | "clientId" | "clientSecret">,
): {
  url: string;
  body: string;
} {
  const params = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: c.refreshToken,
    client_id: c.clientId,
  });
  // Confidential clients (HubSpot) require the secret on refresh; public PKCE
  // clients (Higgsfield) have none set, so the body stays byte-identical.
  if (c.clientSecret) params.set("client_secret", c.clientSecret);
  return { url: c.tokenEndpoint, body: params.toString() };
}

export type OAuthTokenResponse = { access_token: string; expires_in?: number; refresh_token?: string };

export function applyRefreshResponse(prev: OAuthRefreshBundle, res: OAuthTokenResponse, nowMs: number): OAuthRefreshBundle {
  return {
    ...prev,
    accessToken: res.access_token,
    refreshToken: res.refresh_token ?? prev.refreshToken,
    expiresAt: nowMs + (res.expires_in ?? DEFAULT_TTL_S) * 1000,
  };
}

/** Serialize a bundle back to the stored JSON shape (type tag included). */
export function serializeOAuthBundle(b: OAuthRefreshBundle): string {
  const payload: Record<string, unknown> = {
    type: "oauth_refresh",
    accessToken: b.accessToken,
    refreshToken: b.refreshToken,
    expiresAt: b.expiresAt,
    clientId: b.clientId,
    tokenEndpoint: b.tokenEndpoint,
  };
  // Emit clientSecret ONLY when present so public-client bundles serialize to the
  // exact same JSON as before this field existed.
  if (b.clientSecret) payload.clientSecret = b.clientSecret;
  return JSON.stringify(payload);
}
