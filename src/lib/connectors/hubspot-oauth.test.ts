import { describe, expect, it, vi } from "vitest";

import { buildAuthorizeUrl, buildCodeExchangeBody, exchangeCode, generateState, HUBSPOT_OAUTH } from "./hubspot-oauth";

describe("buildAuthorizeUrl", () => {
  it("builds a HubSpot install URL with client_id, redirect_uri, scope, state (no PKCE)", () => {
    const url = new URL(
      buildAuthorizeUrl({ clientId: "cid", redirectUri: "https://arc-studio.ai/api/connectors/hubspot/callback", state: "st8" }),
    );
    expect(`${url.origin}${url.pathname}`).toBe(HUBSPOT_OAUTH.authorizeEndpoint);
    expect(url.searchParams.get("client_id")).toBe("cid");
    expect(url.searchParams.get("redirect_uri")).toBe("https://arc-studio.ai/api/connectors/hubspot/callback");
    expect(url.searchParams.get("state")).toBe("st8");
    // Space-delimited read-only scopes.
    expect(url.searchParams.get("scope")).toBe("oauth crm.objects.contacts.read crm.objects.companies.read crm.objects.deals.read");
    // Confidential client: no PKCE challenge in the authorize URL.
    expect(url.searchParams.get("code_challenge")).toBeNull();
  });
});

describe("buildCodeExchangeBody", () => {
  it("builds the authorization_code body WITH client_secret (confidential client)", () => {
    const body = new URLSearchParams(
      buildCodeExchangeBody({ code: "c0de", redirectUri: "https://x/cb", clientId: "cid", clientSecret: "sekret" }),
    );
    expect(body.get("grant_type")).toBe("authorization_code");
    expect(body.get("client_id")).toBe("cid");
    expect(body.get("client_secret")).toBe("sekret");
    expect(body.get("redirect_uri")).toBe("https://x/cb");
    expect(body.get("code")).toBe("c0de");
    // No PKCE verifier.
    expect(body.get("code_verifier")).toBeNull();
  });
});

describe("generateState", () => {
  it("returns a url-safe value that is unique per call", () => {
    const a = generateState();
    expect(a.length).toBeGreaterThan(10);
    expect(a).not.toMatch(/[+/=]/); // base64url, not standard base64
    expect(generateState()).not.toBe(a);
  });
});

describe("exchangeCode", () => {
  const args = { code: "c0de", redirectUri: "https://x/cb", clientId: "cid", clientSecret: "sekret" };

  it("POSTs form-encoded to the HubSpot token endpoint and maps the token response", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({ access_token: "at_1", refresh_token: "rt_1", expires_in: 1800 }),
    })) as unknown as typeof fetch;

    const before = Date.now();
    const res = await exchangeCode({ ...args, fetchImpl });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.tokens.accessToken).toBe("at_1");
    expect(res.tokens.refreshToken).toBe("rt_1");
    expect(res.tokens.expiresAt).toBeGreaterThanOrEqual(before + 1800 * 1000);

    const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe(HUBSPOT_OAUTH.tokenEndpoint);
    expect((init as RequestInit).method).toBe("POST");
    const body = new URLSearchParams((init as RequestInit).body as string);
    expect(body.get("grant_type")).toBe("authorization_code");
    expect(body.get("client_secret")).toBe("sekret");
  });

  it("fails when the exchange returns a non-2xx status", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 400, text: async () => "bad_code" })) as unknown as typeof fetch;
    const res = await exchangeCode({ ...args, fetchImpl });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("400");
  });

  it("fails when the response is missing access_token or refresh_token", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, json: async () => ({ access_token: "at_1" }) })) as unknown as typeof fetch;
    const res = await exchangeCode({ ...args, fetchImpl });
    expect(res.ok).toBe(false);
  });

  it("fails gracefully on a network error", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("boom");
    }) as unknown as typeof fetch;
    const res = await exchangeCode({ ...args, fetchImpl });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("boom");
  });
});
