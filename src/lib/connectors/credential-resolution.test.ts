import { afterEach, describe, expect, it, vi } from "vitest";

import { createSupabaseQueryMock } from "@/lib/repos/__tests__/test-helpers";

import { resolveConnectorCredential } from "./credential-resolution";

// gemini-research is the first dual-mode entry: byo_key static tier + GEMINI_API_KEY platform var.
const KEY = "gemini-research";
const WS = { connectorKey: KEY, workspaceId: "ws-1" };

function clientWith(input: { ref?: string | null; secret?: string | null }) {
  return createSupabaseQueryMock({
    workspace_connectors: { data: input.ref !== undefined ? { credential_ref: input.ref, enabled: true } : null, error: null },
    decrypted_secrets: { data: input.secret !== undefined ? { decrypted_secret: input.secret } : null, error: null },
  });
}

afterEach(() => vi.unstubAllEnvs());

describe("resolveConnectorCredential", () => {
  it("prefers the workspace's own Vault key (byo, bypasses metering)", async () => {
    vi.stubEnv("GEMINI_API_KEY", "platform-key");
    const result = await resolveConnectorCredential(WS, clientWith({ ref: "ref-1", secret: "workspace-key" }));
    expect(result).toEqual({ source: "byo", credential: "workspace-key", costTier: "byo_key" });
  });

  it("falls back to the platform key, metered", async () => {
    vi.stubEnv("GEMINI_API_KEY", "platform-key");
    const result = await resolveConnectorCredential(WS, clientWith({ ref: null }));
    expect(result).toEqual({ source: "platform", credential: "platform-key", costTier: "metered" });
  });

  it("refuses honestly when neither key exists, naming the env var", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    const result = await resolveConnectorCredential(WS, clientWith({ ref: null }));
    expect(result.source).toBe("none");
    expect(result.credential).toBeNull();
    expect(result.reason).toContain("GEMINI_API_KEY");
  });

  it("never platform-falls-back for a connector that doesn't declare it", async () => {
    vi.stubEnv("GEMINI_API_KEY", "platform-key");
    const result = await resolveConnectorCredential(
      { connectorKey: "news-search", workspaceId: "ws-1" },
      clientWith({ ref: null }),
    );
    expect(result.source).toBe("none");
    expect(result.reason).toBe("No workspace credential is stored for this connector.");
  });

  it("reports unknown connectors instead of guessing", async () => {
    const result = await resolveConnectorCredential({ connectorKey: "nope", workspaceId: "ws-1" }, clientWith({}));
    expect(result).toMatchObject({ source: "none", reason: "Unknown connector: nope" });
  });
});

// competitor-ads is the multi-tenant shape: one deployment token serves every
// workspace (so a customer never has to source their own Meta token), and because
// the Ad Library API bills nothing per call it must stay FREE on the platform path
// rather than flipping to `metered` and charging for a free API.
describe("resolveConnectorCredential — competitor-ads platform token", () => {
  const ADS = { connectorKey: "competitor-ads", workspaceId: "ws-1" };

  it("serves every workspace from the platform token, and does NOT meter it", async () => {
    vi.stubEnv("META_AD_LIBRARY_TOKEN", "platform-meta-token");
    const result = await resolveConnectorCredential(ADS, clientWith({ ref: null }));
    expect(result).toEqual({ source: "platform", credential: "platform-meta-token", costTier: "free" });
  });

  it("still lets a workspace override with its own token (own rate-limit budget)", async () => {
    vi.stubEnv("META_AD_LIBRARY_TOKEN", "platform-meta-token");
    const result = await resolveConnectorCredential(ADS, clientWith({ ref: "ref-1", secret: "workspace-meta-token" }));
    expect(result).toMatchObject({ source: "byo", credential: "workspace-meta-token" });
  });

  it("refuses honestly when neither a workspace nor a platform token exists", async () => {
    vi.stubEnv("META_AD_LIBRARY_TOKEN", "");
    const result = await resolveConnectorCredential(ADS, clientWith({ ref: null }));
    expect(result.source).toBe("none");
    expect(result.credential).toBeNull();
    expect(result.reason).toContain("META_AD_LIBRARY_TOKEN");
  });
});
