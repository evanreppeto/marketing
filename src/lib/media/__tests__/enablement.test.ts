import { afterEach, describe, expect, it, vi } from "vitest";

import { createSupabaseQueryMock } from "@/lib/repos/__tests__/test-helpers";

import { resolveMediaGeneration } from "../enablement";

function configureSupabase() {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-key");
}

function clientWith(input: { enabled?: boolean | null; ref?: string | null; secret?: string | null }) {
  return createSupabaseQueryMock({
    workspace_connectors: [
      { data: input.enabled == null ? null : { enabled: input.enabled }, error: null },
      // resolveConnectorCredential's own row lookup (credential_ref).
      { data: input.ref !== undefined ? { credential_ref: input.ref, enabled: true } : null, error: null },
    ],
    decrypted_secrets: { data: input.secret !== undefined ? { decrypted_secret: input.secret } : null, error: null },
  });
}

afterEach(() => vi.unstubAllEnvs());

describe("resolveMediaGeneration", () => {
  it("enables on the workspace's own key (byo, unmetered) when the connector is on", async () => {
    configureSupabase();
    vi.stubEnv("GEMINI_API_KEY", "platform-key");
    const access = await resolveMediaGeneration("ws-1", clientWith({ enabled: true, ref: "ref-1", secret: "workspace-key" }));
    expect(access).toEqual({ enabled: true, credential: "workspace-key", source: "byo", costTier: "byo_key" });
  });

  it("enables on platform credits (metered) when the connector is on with no stored key", async () => {
    configureSupabase();
    vi.stubEnv("GEMINI_API_KEY", "platform-key");
    const access = await resolveMediaGeneration("ws-1", clientWith({ enabled: true, ref: null }));
    expect(access).toEqual({ enabled: true, credential: "platform-key", source: "platform", costTier: "metered" });
  });

  it("stays off with an honest reason when the connector row is absent or disabled", async () => {
    configureSupabase();
    vi.stubEnv("ARC_MEDIA_ENABLED", "");
    const access = await resolveMediaGeneration("ws-1", clientWith({ enabled: null }));
    expect(access.enabled).toBe(false);
    if (!access.enabled) expect(access.reason).toContain("Settings → Connections");
  });

  it("honors the legacy env flag deployment-wide (platform source, metered)", async () => {
    configureSupabase();
    vi.stubEnv("ARC_MEDIA_ENABLED", "1");
    vi.stubEnv("GEMINI_API_KEY", "legacy-key");
    const access = await resolveMediaGeneration("ws-1", clientWith({ enabled: null }));
    expect(access).toEqual({ enabled: true, credential: "legacy-key", source: "platform", costTier: "metered" });
  });

  it("is off without a workspace and without the legacy flag", async () => {
    vi.stubEnv("ARC_MEDIA_ENABLED", "");
    const access = await resolveMediaGeneration(null);
    expect(access.enabled).toBe(false);
  });
});
