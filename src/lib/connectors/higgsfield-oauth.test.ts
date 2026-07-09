import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { buildAuthorizeUrl, buildCodeExchangeBody, generatePkce, generateState, HIGGSFIELD_OAUTH } from "./higgsfield-oauth";

describe("buildAuthorizeUrl", () => {
  it("builds a PKCE authorize URL with all required params", () => {
    const url = new URL(buildAuthorizeUrl({ clientId: "abc", redirectUri: "https://arc-studio.ai/api/connectors/higgsfield/callback", challenge: "chal", state: "st8" }));
    expect(`${url.origin}${url.pathname}`).toBe(HIGGSFIELD_OAUTH.authorizeEndpoint);
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("client_id")).toBe("abc");
    expect(url.searchParams.get("redirect_uri")).toBe("https://arc-studio.ai/api/connectors/higgsfield/callback");
    expect(url.searchParams.get("code_challenge")).toBe("chal");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("state")).toBe("st8");
    expect(url.searchParams.get("scope")).toContain("offline_access");
  });
});

describe("buildCodeExchangeBody", () => {
  it("builds the authorization_code exchange body with the PKCE verifier", () => {
    const body = new URLSearchParams(buildCodeExchangeBody({ code: "c0de", redirectUri: "https://x/cb", clientId: "abc", verifier: "ver" }));
    expect(body.get("grant_type")).toBe("authorization_code");
    expect(body.get("code")).toBe("c0de");
    expect(body.get("redirect_uri")).toBe("https://x/cb");
    expect(body.get("client_id")).toBe("abc");
    expect(body.get("code_verifier")).toBe("ver");
  });
});

describe("generatePkce", () => {
  it("returns a verifier whose S256 challenge matches", () => {
    const { verifier, challenge } = generatePkce();
    expect(verifier.length).toBeGreaterThan(20);
    const expected = createHash("sha256").update(verifier).digest("base64url");
    expect(challenge).toBe(expected);
    expect(challenge).not.toMatch(/[+/=]/); // base64url, not standard base64
  });
  it("is unique per call", () => {
    expect(generatePkce().verifier).not.toBe(generatePkce().verifier);
    expect(generateState()).not.toBe(generateState());
  });
});
