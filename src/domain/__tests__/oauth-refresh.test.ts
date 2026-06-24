import { describe, expect, it } from "vitest";
import {
  parseConnectorCredential,
  isAccessTokenStale,
  buildRefreshRequest,
  applyRefreshResponse,
} from "../oauth-refresh";

const bundle = {
  type: "oauth_refresh" as const,
  accessToken: "oat_old",
  refreshToken: "rt_old",
  expiresAt: 1_000_000,
  clientId: "client_123",
  tokenEndpoint: "https://mcp.higgsfield.ai/oauth2/token",
};

describe("parseConnectorCredential", () => {
  it("parses an oauth_refresh JSON bundle", () => {
    const c = parseConnectorCredential(JSON.stringify(bundle));
    expect(c).toEqual({
      kind: "oauth_refresh",
      accessToken: "oat_old",
      refreshToken: "rt_old",
      expiresAt: 1_000_000,
      clientId: "client_123",
      tokenEndpoint: "https://mcp.higgsfield.ai/oauth2/token",
    });
  });

  it("treats a bare string as a bearer credential", () => {
    expect(parseConnectorCredential("oat_plain")).toEqual({ kind: "bearer", token: "oat_plain" });
  });

  it("treats malformed JSON or non-refresh JSON as a bearer string (never throws)", () => {
    expect(parseConnectorCredential("{not json")).toEqual({ kind: "bearer", token: "{not json" });
    expect(parseConnectorCredential('{"type":"other"}')).toEqual({ kind: "bearer", token: '{"type":"other"}' });
  });
});

describe("isAccessTokenStale", () => {
  it("is fresh well before expiry", () => {
    expect(isAccessTokenStale({ expiresAt: 1_000_000 }, 500_000)).toBe(false);
  });
  it("is stale within the default 120s skew of expiry", () => {
    expect(isAccessTokenStale({ expiresAt: 1_000_000 }, 1_000_000 - 60_000)).toBe(true);
  });
  it("is stale after expiry", () => {
    expect(isAccessTokenStale({ expiresAt: 1_000_000 }, 1_500_000)).toBe(true);
  });
});

describe("buildRefreshRequest", () => {
  it("builds a form-encoded refresh_token grant with client_id, no secret", () => {
    const req = buildRefreshRequest(bundle);
    expect(req.url).toBe("https://mcp.higgsfield.ai/oauth2/token");
    const params = new URLSearchParams(req.body);
    expect(params.get("grant_type")).toBe("refresh_token");
    expect(params.get("refresh_token")).toBe("rt_old");
    expect(params.get("client_id")).toBe("client_123");
    expect(params.get("client_secret")).toBeNull();
  });
});

describe("applyRefreshResponse", () => {
  it("updates access token + expiry, rotates refresh token when returned", () => {
    const next = applyRefreshResponse(bundle, { access_token: "oat_new", expires_in: 3600, refresh_token: "rt_new" }, 2_000_000);
    expect(next.accessToken).toBe("oat_new");
    expect(next.refreshToken).toBe("rt_new");
    expect(next.expiresAt).toBe(2_000_000 + 3600 * 1000);
    expect(next.clientId).toBe("client_123");
  });
  it("keeps the old refresh token when the response omits one", () => {
    const next = applyRefreshResponse(bundle, { access_token: "oat_new" }, 2_000_000);
    expect(next.refreshToken).toBe("rt_old");
    expect(next.expiresAt).toBe(2_000_000 + 86_400 * 1000); // 24h default when expires_in absent
  });
});
