/**
 * Demo-gate tests for campaigns read-model.
 *
 * Contract: the demo library is served ONLY when Supabase is unconfigured (the
 * local-preview branch). A configured workspace ALWAYS shows its real state —
 * even when empty — regardless of the ARC_DEMO_DATA flag. A configured but empty
 * org must never be masked with fake campaigns (that hid real Arc-created drafts).
 *
 *   - flag OFF + empty live (configured client) → real empty list (no demo- campaigns)
 *   - flag ON  + empty live (configured client) → real empty list (flag does NOT
 *     inject demo data once Supabase is configured)
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { createSupabaseQueryMock } from "@/lib/repos/__tests__/test-helpers";

import { buildDemoCampaignWorkspaceList, getCampaignWorkspaceList } from "./read-model";

afterEach(() => vi.unstubAllEnvs());

function emptyClient() {
  return createSupabaseQueryMock({
    campaigns: { data: [], error: null },
    campaign_assets: { data: [], error: null },
    approval_items: { data: [], error: null },
    agent_outputs: { data: [], error: null },
  });
}

describe("getCampaignWorkspaceList demo gate (explicit client)", () => {
  it("flag OFF + empty live read (explicit client) → real empty list (no demo- campaigns)", async () => {
    vi.stubEnv("ARC_DEMO_DATA", "0");
    const result = await getCampaignWorkspaceList(emptyClient(), "Arc", "org-1");

    expect(result.status).toBe("live");
    if (result.status !== "live") return;
    expect(result.campaigns).toHaveLength(0);
    expect(result.totals.campaigns).toBe(0);
    expect(result.campaigns.every((c) => !c.id.startsWith("demo-"))).toBe(true);
  });

  it("flag ON + empty live read (configured client) → real empty list (no demo masking)", async () => {
    vi.stubEnv("ARC_DEMO_DATA", "1");
    const result = await getCampaignWorkspaceList(emptyClient(), "Arc", "org-1");

    // Once Supabase is configured, the flag must NOT inject demo campaigns over a
    // real (empty) read — the workspace shows its true state.
    expect(result.status).toBe("live");
    if (result.status !== "live") return;
    expect(result.campaigns).toHaveLength(0);
    expect(result.campaigns.every((c) => !c.id.startsWith("demo-"))).toBe(true);
  });
});

describe("buildDemoCampaignWorkspaceList (demo bundle shape regression)", () => {
  it("defaults to a neutral demo library with demo- IDs", () => {
    const result = buildDemoCampaignWorkspaceList("Arc");

    expect(result.status).toBe("live");
    if (result.status !== "live") return;
    expect(result.campaigns.length).toBeGreaterThan(0);
    expect(result.campaigns.some((c) => c.id.startsWith("demo-"))).toBe(true);
    expect(result.campaigns.some((c) => /water|storm|restoration/i.test(`${c.name} ${c.objective}`))).toBe(false);
  });

  it("keeps the restoration showcase available only when explicitly selected", () => {
    vi.stubEnv("ARC_DEMO_INDUSTRY", "restoration");
    const result = buildDemoCampaignWorkspaceList("Arc");

    expect(result.status).toBe("live");
    if (result.status !== "live") return;
    expect(result.campaigns.some((c) => /water|storm|restoration/i.test(`${c.name} ${c.objective}`))).toBe(true);
  });
});
