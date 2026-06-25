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
      return {
        kind: "oauth_refresh",
        accessToken: String(o.accessToken ?? ""),
        refreshToken: String(o.refreshToken ?? ""),
        expiresAt: Number(o.expiresAt ?? 0),
        clientId: String(o.clientId ?? ""),
        tokenEndpoint: String(o.tokenEndpoint ?? ""),
      };
    }
  } catch {
    // not JSON — fall through to bearer
  }
  return { kind: "bearer", token: raw };
}

export function isAccessTokenStale(c: { expiresAt: number }, nowMs: number, skewMs = DEFAULT_SKEW_MS): boolean {
  return c.expiresAt - nowMs <= skewMs;
}

export function buildRefreshRequest(c: Pick<OAuthRefreshBundle, "tokenEndpoint" | "refreshToken" | "clientId">): {
  url: string;
  body: string;
} {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: c.refreshToken,
    client_id: c.clientId,
  }).toString();
  return { url: c.tokenEndpoint, body };
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
  return JSON.stringify({
    type: "oauth_refresh",
    accessToken: b.accessToken,
    refreshToken: b.refreshToken,
    expiresAt: b.expiresAt,
    clientId: b.clientId,
    tokenEndpoint: b.tokenEndpoint,
  });
}
