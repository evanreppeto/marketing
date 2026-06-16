import { describe, expect, it } from "vitest";

import { createSupabaseQueryMock, type MockSupabase } from "@/lib/repos/__tests__/test-helpers";

import { createCampaignShell, promoteAssetToCampaign } from "./create";

function inserts(supabase: MockSupabase): Array<Record<string, unknown>> {
  return supabase.calls.filter(([m]) => m === "insert").map(([, arg]) => arg as Record<string, unknown>);
}

describe("createCampaignShell", () => {
  it("inserts a draft, launch-locked campaign + created event", async () => {
    const supabase = createSupabaseQueryMock({
      campaigns: { data: { id: "camp-1" }, error: null },
      campaign_events: { data: null, error: null },
    });

    const { campaignId } = await createCampaignShell({
      operator: "op",
      name: "Storm push",
      persona: "persona_landlord",
      restorationFocus: "flood",
      client: supabase,
    });

    expect(campaignId).toBe("camp-1");
    const [campaign, event] = inserts(supabase);
    expect(campaign.status).toBe("draft");
    expect(campaign.launch_locked).toBe(true);
    expect(campaign.persona).toBe("persona_landlord");
    expect(campaign.restoration_focus).toBe("flood");
    expect(event.event_type).toBe("created");
  });
});

describe("promoteAssetToCampaign", () => {
  it("inserts a pending asset + approval gate + asset_generated event", async () => {
    const supabase = createSupabaseQueryMock({
      campaign_assets: { data: { id: "asset-1" }, error: null },
      approval_items: { data: null, error: null },
      campaign_events: { data: null, error: null },
    });

    const { assetId } = await promoteAssetToCampaign({
      operator: "op",
      campaignId: "camp-1",
      assetType: "social_ad",
      title: "Ad",
      body: "copy",
      mediaUrl: null,
      client: supabase,
    });

    expect(assetId).toBe("asset-1");
    const [asset, gate, event] = inserts(supabase);
    expect(asset.status).toBe("pending_approval");
    expect(asset.dispatch_locked).toBe(true);
    expect(asset.tool_source).toBe("arc_saved");
    expect(gate.campaign_asset_id).toBe("asset-1");
    expect(gate.status).toBe("pending_approval");
    expect(event.event_type).toBe("asset_generated");
  });
});
