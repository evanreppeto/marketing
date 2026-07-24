import { describe, expect, it, vi, afterEach } from "vitest";

import {
  buildHubspotAuthorizeUrl,
  exchangeHubspotCode,
  isHubspotOAuthConfigured,
  resolveHubspotAccessToken,
  HUBSPOT_OAUTH,
} from "../hubspot-oauth";
import { serializeOAuthBundle } from "@/domain";

afterEach(() => vi.unstubAllEnvs());

const fakeClient = {} as never;

describe("isHubspotOAuthConfigured", () => {
  it("is false without both env vars, true with both", () => {
    vi.stubEnv("HUBSPOT_CLIENT_ID", "");
    vi.stubEnv("HUBSPOT_CLIENT_SECRET", "");
    expect(isHubspotOAuthConfigured()).toBe(false);
    vi.stubEnv("HUBSPOT_CLIENT_ID", "cid");
    expect(isHubspotOAuthConfigured()).toBe(false);
    vi.stubEnv("HUBSPOT_CLIENT_SECRET", "secret");
    expect(isHubspotOAuthConfigured()).toBe(true);
  });
});

describe("buildHubspotAuthorizeUrl", () => {
  it("carries client_id, redirect_uri, scopes and state", () => {
    const url = buildHubspotAuthorizeUrl({ clientId: "cid", redirectUri: "https://app/x/callback", state: "st8" });
    expect(url.startsWith(HUBSPOT_OAUTH.authorizeEndpoint)).toBe(true);
    const q = new URL(url).searchParams;
    expect(q.get("client_id")).toBe("cid");
    expect(q.get("redirect_uri")).toBe("https://app/x/callback");
    expect(q.get("state")).toBe("st8");
    expect(q.get("scope")).toBe(HUBSPOT_OAUTH.scopes.join(" "));
  });
});

describe("exchangeHubspotCode", () => {
  it("fails cleanly when the app isn't configured", async () => {
    vi.stubEnv("HUBSPOT_CLIENT_ID", "");
    vi.stubEnv("HUBSPOT_CLIENT_SECRET", "");
    const res = await exchangeHubspotCode({ code: "c", redirectUri: "https://app/cb" });
    expect(res.ok).toBe(false);
  });

  it("posts the confidential-client body and maps the token response", async () => {
    vi.stubEnv("HUBSPOT_CLIENT_ID", "cid");
    vi.stubEnv("HUBSPOT_CLIENT_SECRET", "sec");
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ access_token: "at", refresh_token: "rt", expires_in: 1800 }),
    }) as unknown as Response);
    const res = await exchangeHubspotCode({ code: "the-code", redirectUri: "https://app/cb", fetchImpl, now: 1_000_000 });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.tokens).toEqual({ accessToken: "at", refreshToken: "rt", expiresAt: 1_000_000 + 1800 * 1000 });
    }
    const body = String((fetchImpl.mock.calls[0][1] as RequestInit).body);
    expect(body).toContain("grant_type=authorization_code");
    expect(body).toContain("client_secret=sec");
    expect(body).toContain("code=the-code");
  });

  it("surfaces a non-2xx exchange as an error", async () => {
    vi.stubEnv("HUBSPOT_CLIENT_ID", "cid");
    vi.stubEnv("HUBSPOT_CLIENT_SECRET", "sec");
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 400, text: async () => "bad" }) as unknown as Response);
    const res = await exchangeHubspotCode({ code: "c", redirectUri: "https://app/cb", fetchImpl });
    expect(res.ok).toBe(false);
  });
});

describe("resolveHubspotAccessToken", () => {
  it("returns a pasted private-app token as-is (bearer path, no network)", async () => {
    const fetchImpl = vi.fn();
    const res = await resolveHubspotAccessToken(fakeClient, "ref", "pat-na1-abc", { fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(res).toEqual({ ok: true, accessToken: "pat-na1-abc" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("returns a still-fresh bundle's access token without refreshing", async () => {
    const fetchImpl = vi.fn();
    const bundle = serializeOAuthBundle({
      kind: "oauth_refresh",
      accessToken: "fresh",
      refreshToken: "rt",
      expiresAt: 5_000_000,
      clientId: "cid",
      tokenEndpoint: HUBSPOT_OAUTH.tokenEndpoint,
    });
    const res = await resolveHubspotAccessToken(fakeClient, "ref", bundle, { fetchImpl: fetchImpl as unknown as typeof fetch, now: 1_000_000 });
    expect(res).toEqual({ ok: true, accessToken: "fresh" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("refreshes a stale bundle with the client secret and returns the new token", async () => {
    vi.stubEnv("HUBSPOT_CLIENT_ID", "cid");
    vi.stubEnv("HUBSPOT_CLIENT_SECRET", "sec");
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ access_token: "rotated", expires_in: 1800 }),
    }) as unknown as Response);
    const bundle = serializeOAuthBundle({
      kind: "oauth_refresh",
      accessToken: "stale",
      refreshToken: "rt",
      expiresAt: 1_000, // long past
      clientId: "cid",
      tokenEndpoint: HUBSPOT_OAUTH.tokenEndpoint,
    });
    const res = await resolveHubspotAccessToken(fakeClient, "ref", bundle, { fetchImpl: fetchImpl as unknown as typeof fetch, now: 9_000_000 });
    expect(res).toEqual({ ok: true, accessToken: "rotated" });
    const body = String((fetchImpl.mock.calls[0][1] as RequestInit).body);
    expect(body).toContain("grant_type=refresh_token");
    expect(body).toContain("client_secret=sec");
  });
});
