import { describe, expect, it } from "vitest";

import { createSupabaseQueryMock } from "@/lib/repos/__tests__/test-helpers";

import { getExemplarCandidates, MAX_CANDIDATE_ASSETS } from "./read-model";

const ORG = "org-1";

const ASSET = {
  id: "a1",
  campaign_id: "cmp-1",
  asset_type: "email",
  channel: "email",
  title: "Flood response",
  status: "approved",
  draft_body: "draft copy",
  edited_body: null,
  approved_body: "approved copy",
  approved_at: "2026-07-01T00:00:00.000Z",
  edited_fields: {},
};

function mock(overrides: Record<string, { data: unknown; error: { message: string } | null }> = {}) {
  return createSupabaseQueryMock({
    campaign_assets: { data: [ASSET], error: null },
    campaigns: { data: [{ id: "cmp-1", persona: "persona_landlord" }], error: null },
    campaign_events: { data: [], error: null },
    campaign_results: { data: [], error: null },
    engagement_events: { data: [], error: null },
    ...overrides,
  });
}

describe("getExemplarCandidates", () => {
  it("refuses without an org rather than reading across workspaces", async () => {
    const supabase = mock();
    const result = await getExemplarCandidates(null, supabase);
    expect(result.status).toBe("unavailable");
    // The refusal must happen before any query — no org filter, no query at all.
    expect(supabase.calls).toHaveLength(0);
  });

  it("scopes every table read to the org", async () => {
    const supabase = mock();
    await getExemplarCandidates(ORG, supabase);

    const tables = supabase.calls.filter(([method]) => method === "from").map(([, table]) => table);
    expect(tables).toEqual(
      expect.arrayContaining(["campaign_assets", "campaigns", "campaign_events", "campaign_results", "engagement_events"]),
    );

    const orgFilters = supabase.calls.filter(([method, column, value]) => method === "eq" && column === "org_id" && value === ORG);
    expect(orgFilters).toHaveLength(tables.length);
  });

  it("returns shaped candidates joined to their campaign persona", async () => {
    const result = await getExemplarCandidates(ORG, mock());
    expect(result.status).toBe("live");
    if (result.status !== "live") return;
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]).toMatchObject({
      assetId: "a1",
      persona: "persona_landlord",
      body: "approved copy",
      approval: { approved: true, approvedUnchanged: true, revisionCount: 0, declined: false },
    });
  });

  it("short-circuits the joins when the org has no assets", async () => {
    const supabase = mock({ campaign_assets: { data: [], error: null } });
    const result = await getExemplarCandidates(ORG, supabase);
    expect(result.status).toBe("live");
    if (result.status !== "live") return;
    expect(result.candidates).toEqual([]);
    const tables = supabase.calls.filter(([method]) => method === "from").map(([, table]) => table);
    expect(tables).toEqual(["campaign_assets"]);
  });

  it("bounds the asset read", async () => {
    const supabase = mock();
    await getExemplarCandidates(ORG, supabase);
    expect(supabase.calls).toContainEqual(["limit", MAX_CANDIDATE_ASSETS]);
  });

  it("surfaces a query error as unavailable with the table name", async () => {
    const supabase = mock({ campaign_assets: { data: null, error: { message: "boom" } } });
    const result = await getExemplarCandidates(ORG, supabase);
    expect(result.status).toBe("unavailable");
    if (result.status !== "unavailable") return;
    expect(result.message).toContain("campaign_assets");
    expect(result.message).toContain("boom");
  });

  it("surfaces a joined-table error rather than returning partial candidates", async () => {
    const supabase = mock({ campaign_results: { data: null, error: { message: "results down" } } });
    const result = await getExemplarCandidates(ORG, supabase);
    expect(result.status).toBe("unavailable");
    if (result.status !== "unavailable") return;
    expect(result.message).toContain("campaign_results");
  });
});
