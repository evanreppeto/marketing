import { describe, expect, it, vi, afterEach } from "vitest";

import { serializeOAuthBundle } from "@/domain";

import {
  buildGoogleAuthorizeUrl,
  exchangeGoogleCode,
  GOOGLE_OAUTH,
  isGoogleOAuthConfigured,
  resolveGoogleAccessToken,
} from "../google-oauth";

afterEach(() => vi.unstubAllEnvs());

const fakeClient = {} as never;

describe("isGoogleOAuthConfigured", () => {
  it("needs both env vars", () => {
    vi.stubEnv("GOOGLE_CLIENT_ID", "");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "");
    expect(isGoogleOAuthConfigured()).toBe(false);
    vi.stubEnv("GOOGLE_CLIENT_ID", "cid");
    expect(isGoogleOAuthConfigured()).toBe(false);
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "sec");
    expect(isGoogleOAuthConfigured()).toBe(true);
  });
});

describe("buildGoogleAuthorizeUrl", () => {
  it("requests offline access + consent so a refresh_token comes back", () => {
    const url = buildGoogleAuthorizeUrl({ clientId: "cid", redirectUri: "https://app/cb", state: "st8" });
    const q = new URL(url).searchParams;
    expect(q.get("access_type")).toBe("offline");
    expect(q.get("prompt")).toBe("consent");
    expect(q.get("response_type")).toBe("code");
    expect(q.get("scope")).toBe(GOOGLE_OAUTH.scopes.join(" "));
    expect(q.get("state")).toBe("st8");
  });
});

describe("exchangeGoogleCode", () => {
  it("fails cleanly when the app isn't configured", async () => {
    vi.stubEnv("GOOGLE_CLIENT_ID", "");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "");
    expect((await exchangeGoogleCode({ code: "c", redirectUri: "https://app/cb" })).ok).toBe(false);
  });

  it("posts the confidential-client body and maps the tokens", async () => {
    vi.stubEnv("GOOGLE_CLIENT_ID", "cid");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "sec");
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ access_token: "at", refresh_token: "rt", expires_in: 3600 }),
    }) as unknown as Response);
    const res = await exchangeGoogleCode({ code: "the-code", redirectUri: "https://app/cb", fetchImpl, now: 1_000_000 });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.tokens).toEqual({ accessToken: "at", refreshToken: "rt", expiresAt: 1_000_000 + 3600 * 1000 });
    const body = String((fetchImpl.mock.calls[0][1] as RequestInit).body);
    expect(body).toContain("client_secret=sec");
    expect(body).toContain("grant_type=authorization_code");
  });

  it("rejects a response missing the refresh_token (offline consent not granted)", async () => {
    vi.stubEnv("GOOGLE_CLIENT_ID", "cid");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "sec");
    const fetchImpl = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ access_token: "at" }) }) as unknown as Response);
    expect((await exchangeGoogleCode({ code: "c", redirectUri: "https://app/cb", fetchImpl })).ok).toBe(false);
  });
});

describe("resolveGoogleAccessToken", () => {
  it("returns a fresh bundle's token without refreshing", async () => {
    const fetchImpl = vi.fn();
    const bundle = serializeOAuthBundle({
      kind: "oauth_refresh",
      accessToken: "fresh",
      refreshToken: "rt",
      expiresAt: 5_000_000,
      clientId: "cid",
      tokenEndpoint: GOOGLE_OAUTH.tokenEndpoint,
    });
    const res = await resolveGoogleAccessToken(fakeClient, "ref", bundle, { fetchImpl: fetchImpl as unknown as typeof fetch, now: 1_000_000 });
    expect(res).toEqual({ ok: true, accessToken: "fresh" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("refreshes a stale bundle with the client secret", async () => {
    vi.stubEnv("GOOGLE_CLIENT_ID", "cid");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "sec");
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ access_token: "rotated", expires_in: 3600 }),
    }) as unknown as Response);
    const bundle = serializeOAuthBundle({
      kind: "oauth_refresh",
      accessToken: "stale",
      refreshToken: "rt",
      expiresAt: 1_000,
      clientId: "cid",
      tokenEndpoint: GOOGLE_OAUTH.tokenEndpoint,
    });
    const res = await resolveGoogleAccessToken(fakeClient, "ref", bundle, { fetchImpl: fetchImpl as unknown as typeof fetch, now: 9_000_000 });
    expect(res).toEqual({ ok: true, accessToken: "rotated" });
    expect(String((fetchImpl.mock.calls[0][1] as RequestInit).body)).toContain("grant_type=refresh_token");
  });

  it("surfaces a refresh failure so the operator is told to reconnect", async () => {
    vi.stubEnv("GOOGLE_CLIENT_ID", "cid");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "sec");
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 400, text: async () => "invalid_grant" }) as unknown as Response);
    const bundle = serializeOAuthBundle({
      kind: "oauth_refresh",
      accessToken: "stale",
      refreshToken: "revoked",
      expiresAt: 1_000,
      clientId: "cid",
      tokenEndpoint: GOOGLE_OAUTH.tokenEndpoint,
    });
    const res = await resolveGoogleAccessToken(fakeClient, "ref", bundle, { fetchImpl: fetchImpl as unknown as typeof fetch, now: 9_000_000 });
    expect(res.ok).toBe(false);
  });
});
