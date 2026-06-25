import { describe, expect, it, vi, afterEach } from "vitest";
import { ensureFreshAccessToken } from "../oauth-refresh";
import type { OAuthRefreshBundle } from "@/domain";

const credentials = vi.hoisted(() => ({
  updateConnectorCredential: vi.fn(async (_client: unknown, _ref: string | null, _plaintext: string) => true),
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
});
