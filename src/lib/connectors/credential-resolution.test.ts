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
