import { describe, expect, it } from "vitest";

import { createSupabaseQueryMock } from "@/lib/repos/__tests__/test-helpers";

import { launchCampaign } from "./launch";

function findCalls(supabase: { calls: Array<[string, ...unknown[]]> }, method: string) {
  return supabase.calls.filter(([m]) => m === method).map(([, arg]) => arg as Record<string, unknown>);
}

describe("launchCampaign enqueues dispatches", () => {
  it("inserts a campaign_dispatches row for each approved asset", async () => {
    const supabase = createSupabaseQueryMock({
      campaigns: { data: { id: "c1", launch_locked: true, status: "review", persona: "persona_homeowner_emergency", contact_id: null, company_id: null }, error: null },
      campaign_assets: { data: [{ id: "a1", channel: "email", title: "Welcome", approved_body: "Hi", edited_body: null, draft_body: null }], error: null },
      approval_items: { data: [{ id: "ap1", status: "approved", campaign_asset_id: "a1" }], error: null },
      contacts: { data: [{ id: "ct1", persona: "persona_homeowner_emergency", status: "active", email: "lead@example.com", phone: null, full_name: "Lead One", company_id: null }], error: null },
      campaign_dispatches: { data: [], error: null },
      campaign_events: { data: null, error: null },
    });

    await launchCampaign({ campaignId: "c1", operator: "Operator", tenant: { org_id: "org-1", workspace_id: "workspace-1" } }, supabase);

    const inserts = findCalls(supabase, "insert");
    expect(inserts).toContainEqual(
      expect.objectContaining({ campaign_id: "c1", campaign_asset_id: "a1", status: "queued", org_id: "org-1" }),
    );
    expect(inserts).toContainEqual(expect.objectContaining({ event_type: "campaign_launched", org_id: "org-1" }));
    expect(supabase.calls.filter((call) => call[0] === "eq" && call[1] === "org_id" && call[2] === "org-1").length).toBeGreaterThanOrEqual(4);
  });
});
