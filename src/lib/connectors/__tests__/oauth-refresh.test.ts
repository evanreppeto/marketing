import { describe, expect, it, vi, afterEach } from "vitest";
import { ensureFreshAccessToken, resolveConnectorAccessToken } from "../oauth-refresh";
import { serializeOAuthBundle, type OAuthRefreshBundle } from "@/domain";

const credentials = vi.hoisted(() => ({
  // Typed signature (not named params) so mock.calls[0] destructures as a tuple.
  updateConnectorCredential: vi.fn<(client: unknown, ref: string | null, plaintext: string) => Promise<boolean>>(
    async () => true,
  ),
  readConnectorCredential: vi.fn<(client: unknown, ref: string | null) => Promise<string | null>>(async () => null),
}));
vi.mock("../credentials", () => credentials);

const baseBundle: OAuthRefreshBundle = {
  kind: "oauth_refresh",
  accessToken: "oat_old",
  refreshToken: "rt_old",
  expiresAt: 0, // always stale relative to Date.now()
  clientId: "client_123",
  tokenEndpoint: "https://mcp.higgsfield.ai/oauth2/token",
};

afterEach(() => {
  vi.restoreAllMocks();
  credentials.updateConnectorCredential.mockClear();
  credentials.readConnectorCredential.mockReset();
  credentials.readConnectorCredential.mockResolvedValue(null);
});

describe("ensureFreshAccessToken", () => {
  it("returns the current token without fetching when not stale", async () => {
    const fresh = { ...baseBundle, expiresAt: Date.now() + 3_600_000 };
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const res = await ensureFreshAccessToken({} as never, "ref-1", fresh);
    expect(res).toEqual({ ok: true, accessToken: "oat_old" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("refreshes a stale token, persists the new bundle, returns the new token", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ access_token: "oat_new", expires_in: 3600, refresh_token: "rt_new" }) })));
    const res = await ensureFreshAccessToken({} as never, "ref-1", baseBundle);
    expect(res).toEqual({ ok: true, accessToken: "oat_new" });
    expect(credentials.updateConnectorCredential).toHaveBeenCalledTimes(1);
    const [, ref, serialized] = credentials.updateConnectorCredential.mock.calls[0];
    expect(ref).toBe("ref-1");
    expect(serialized).toContain("oat_new");
    expect(serialized).toContain("rt_new");
  });

  it("still returns the fresh token even if persistence fails (best-effort)", async () => {
    credentials.updateConnectorCredential.mockResolvedValueOnce(false);
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ access_token: "oat_new" }) })));
    const res = await ensureFreshAccessToken({} as never, "ref-1", baseBundle);
    expect(res).toEqual({ ok: true, accessToken: "oat_new" });
  });

  it("returns needs_reconnect when the token endpoint rejects the refresh", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 400, text: async () => "invalid_grant" })));
    const res = await ensureFreshAccessToken({} as never, "ref-1", baseBundle);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("needs_reconnect");
  });

  it("returns needs_reconnect on a network error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("boom"); }));
    const res = await ensureFreshAccessToken({} as never, "ref-1", baseBundle);
    expect(res.ok).toBe(false);
  });

  it("returns needs_reconnect when a 200 response omits access_token", async () => {
    const persist = credentials.updateConnectorCredential;
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({}) })));
    const res = await ensureFreshAccessToken({} as never, "ref-1", baseBundle);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("needs_reconnect");
    expect(persist).not.toHaveBeenCalled(); // never persists a token-less response
  });

  it("returns needs_reconnect when a 200 body is not JSON", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => { throw new Error("not json"); } })));
    const res = await ensureFreshAccessToken({} as never, "ref-1", baseBundle);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("needs_reconnect");
  });
});

describe("resolveConnectorAccessToken", () => {
  it("returns a bare (pasted) token as-is, with no refresh call", async () => {
    credentials.readConnectorCredential.mockResolvedValueOnce("pat-abc123");
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const res = await resolveConnectorAccessToken({} as never, "ref-1");
    expect(res).toEqual({ ok: true, accessToken: "pat-abc123" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns the access token from a fresh OAuth bundle without refreshing", async () => {
    const fresh: OAuthRefreshBundle = { ...baseBundle, expiresAt: Date.now() + 3_600_000 };
    credentials.readConnectorCredential.mockResolvedValueOnce(serializeOAuthBundle(fresh));
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const res = await resolveConnectorAccessToken({} as never, "ref-1");
    expect(res).toEqual({ ok: true, accessToken: "oat_old" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("refreshes a stale OAuth bundle and returns the new access token", async () => {
    credentials.readConnectorCredential.mockResolvedValueOnce(serializeOAuthBundle(baseBundle)); // expiresAt 0 → stale
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ access_token: "oat_new", expires_in: 3600 }) })));
    const res = await resolveConnectorAccessToken({} as never, "ref-1");
    expect(res).toEqual({ ok: true, accessToken: "oat_new" });
  });

  it("returns needs_reconnect when a stale bundle can't be refreshed", async () => {
    credentials.readConnectorCredential.mockResolvedValueOnce(serializeOAuthBundle(baseBundle));
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 400, text: async () => "invalid_grant" })));
    const res = await resolveConnectorAccessToken({} as never, "ref-1");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("needs_reconnect");
  });

  it("returns missing when there is no stored credential", async () => {
    credentials.readConnectorCredential.mockResolvedValueOnce(null);
    const res = await resolveConnectorAccessToken({} as never, null);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("missing");
  });
});
