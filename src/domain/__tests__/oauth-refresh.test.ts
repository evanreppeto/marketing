import { describe, expect, it } from "vitest";
import {
  parseConnectorCredential,
  isAccessTokenStale,
  buildRefreshRequest,
  applyRefreshResponse,
  serializeOAuthBundle,
} from "../oauth-refresh";

// In-memory bundle (discriminator is `kind`); the on-the-wire JSON shape uses `type`.
const bundle = {
  kind: "oauth_refresh" as const,
  accessToken: "oat_old",
  refreshToken: "rt_old",
  expiresAt: 1_000_000,
  clientId: "client_123",
  tokenEndpoint: "https://mcp.higgsfield.ai/oauth2/token",
};

describe("parseConnectorCredential", () => {
  it("parses an oauth_refresh JSON bundle", () => {
    const c = parseConnectorCredential(
      JSON.stringify({
        type: "oauth_refresh",
        accessToken: "oat_old",
        refreshToken: "rt_old",
        expiresAt: 1_000_000,
        clientId: "client_123",
        tokenEndpoint: "https://mcp.higgsfield.ai/oauth2/token",
      }),
    );
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

  it("round-trips serializeOAuthBundle back to the oauth_refresh credential", () => {
    const inMemoryBundle = {
      kind: "oauth_refresh" as const,
      accessToken: "oat_old",
      refreshToken: "rt_old",
      expiresAt: 1_000_000,
      clientId: "client_123",
      tokenEndpoint: "https://mcp.higgsfield.ai/oauth2/token",
    };
    expect(parseConnectorCredential(serializeOAuthBundle(inMemoryBundle))).toEqual(inMemoryBundle);
  });

  it("round-trips a confidential bundle including clientSecret", () => {
    const confidential = {
      kind: "oauth_refresh" as const,
      accessToken: "at_1",
      refreshToken: "rt_1",
      expiresAt: 2_000_000,
      clientId: "hs_client",
      tokenEndpoint: "https://api.hubapi.com/oauth/v1/token",
      clientSecret: "sekret",
    };
    expect(parseConnectorCredential(serializeOAuthBundle(confidential))).toEqual(confidential);
  });

  it("parses a bundle with no clientSecret without adding the key", () => {
    const parsed = parseConnectorCredential(
      JSON.stringify({ type: "oauth_refresh", accessToken: "a", refreshToken: "r", expiresAt: 1, clientId: "c", tokenEndpoint: "t" }),
    );
    expect("clientSecret" in parsed).toBe(false);
  });
});

describe("serializeOAuthBundle", () => {
  // The public-client JSON must be byte-identical to the pre-clientSecret shape so
  // existing stored Higgsfield credentials are untouched by this change.
  it("omits clientSecret from the JSON for a public bundle", () => {
    const json = serializeOAuthBundle(bundle);
    expect(json).toBe(
      JSON.stringify({
        type: "oauth_refresh",
        accessToken: "oat_old",
        refreshToken: "rt_old",
        expiresAt: 1_000_000,
        clientId: "client_123",
        tokenEndpoint: "https://mcp.higgsfield.ai/oauth2/token",
      }),
    );
    expect(json).not.toContain("clientSecret");
  });

  it("includes clientSecret in the JSON for a confidential bundle", () => {
    const json = serializeOAuthBundle({ ...bundle, clientSecret: "sekret" });
    expect(JSON.parse(json).clientSecret).toBe("sekret");
  });
});

describe("applyRefreshResponse (clientSecret preservation)", () => {
  it("carries clientSecret through a refresh so subsequent refreshes stay authenticated", () => {
    const confidential = { ...bundle, clientSecret: "sekret" };
    const next = applyRefreshResponse(confidential, { access_token: "at_new", expires_in: 1800 }, 3_000_000);
    expect(next.clientSecret).toBe("sekret");
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

  // PUBLIC client (Higgsfield): no clientSecret → the refresh body must be
  // BYTE-IDENTICAL to what it was before clientSecret existed. This guards the
  // shared-path change from ever altering the existing public-client behavior.
  it("keeps the public-client refresh body byte-identical (no client_secret key)", () => {
    const req = buildRefreshRequest(bundle);
    expect(req.body).toBe("grant_type=refresh_token&refresh_token=rt_old&client_id=client_123");
  });

  // CONFIDENTIAL client (HubSpot): clientSecret set → the refresh body MUST include
  // client_secret (HubSpot's token endpoint requires it on refresh).
  it("appends client_secret for a confidential client", () => {
    const req = buildRefreshRequest({ ...bundle, tokenEndpoint: "https://api.hubapi.com/oauth/v1/token", clientSecret: "sekret" });
    expect(req.url).toBe("https://api.hubapi.com/oauth/v1/token");
    const params = new URLSearchParams(req.body);
    expect(params.get("grant_type")).toBe("refresh_token");
    expect(params.get("refresh_token")).toBe("rt_old");
    expect(params.get("client_id")).toBe("client_123");
    expect(params.get("client_secret")).toBe("sekret");
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
