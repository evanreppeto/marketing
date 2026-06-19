import { describe, expect, it } from "vitest";

import { createSupabaseQueryMock } from "@/lib/repos/__tests__/test-helpers";
import type { ParsedCampaignResult } from "@/domain";

import { persistCampaignResults } from "./results-persistence";

function findCalls(supabase: { calls: Array<[string, ...unknown[]]> }, method: string) {
  return supabase.calls.filter(([m]) => m === method).map(([, arg]) => arg as Record<string, unknown>);
}

const row: ParsedCampaignResult = {
  campaign_id: "11111111-1111-1111-1111-111111111111",
  campaign_asset_id: null,
  channel: "meta_ad",
  period_start: "2026-05-01",
  period_end: "2026-05-31",
  impressions: 1000, clicks: 50, calls: 0, forms: 0, leads: 5, jobs: 1,
  won_revenue_cents: 200000, spend_cents: 50000, metadata: {},
};

describe("persistCampaignResults", () => {
  it("inserts a new result when no matching period row exists", async () => {
    const supabase = createSupabaseQueryMock({ campaign_results: { data: null, error: null } });
    const out = await persistCampaignResults([row], supabase, { org_id: "org-1", workspace_id: "workspace-1" });
    expect(out).toMatchObject({ inserted: 1, updated: 0 });
    expect(findCalls(supabase, "insert")).toContainEqual(expect.objectContaining({ campaign_id: row.campaign_id, impressions: 1000, org_id: "org-1" }));
    expect(supabase.calls).toContainEqual(["eq", "org_id", "org-1"]);
  });

  it("updates the existing row when a matching period row exists", async () => {
    const supabase = createSupabaseQueryMock({ campaign_results: { data: { id: "res-1" }, error: null } });
    const out = await persistCampaignResults([row], supabase, { org_id: "org-1", workspace_id: "workspace-1" });
    expect(out).toMatchObject({ inserted: 0, updated: 1 });
    expect(findCalls(supabase, "update")).toContainEqual(expect.objectContaining({ impressions: 1000 }));
    expect(supabase.calls.filter((call) => call[0] === "eq" && call[1] === "org_id" && call[2] === "org-1")).toHaveLength(2);
  });
});
