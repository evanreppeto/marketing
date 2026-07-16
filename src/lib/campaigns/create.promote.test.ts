import { describe, expect, it } from "vitest";

import { createSupabaseQueryMock, type MockResponse, type MockSupabase } from "@/lib/repos/__tests__/test-helpers";

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
      tenant: { org_id: "org-1", workspace_id: "workspace-1" },
    });

    expect(campaignId).toBe("camp-1");
    const [campaign, event] = inserts(supabase);
    expect(campaign.status).toBe("draft");
    expect(campaign.launch_locked).toBe(true);
    expect(campaign.persona).toBe("persona_landlord");
    expect(campaign.restoration_focus).toBe("flood");
    expect(campaign.org_id).toBe("org-1");
    expect(event.event_type).toBe("created");
    expect(event.org_id).toBe("org-1");
  });
});

/** A `business_profiles` row as the copy screen reads it. */
function profileRow(overrides: Record<string, unknown> = {}) {
  return {
    status: "active",
    banned_phrases: ["act now"],
    guardrails: { complianceNotes: "Keep claims truthful." },
    ...overrides,
  };
}

function promote(supabase: MockSupabase, body: string | null) {
  return promoteAssetToCampaign({
    operator: "op",
    campaignId: "camp-1",
    assetType: "social_ad",
    title: "Ad",
    body,
    mediaUrl: null,
    client: supabase,
    tenant: { org_id: "org-1", workspace_id: "workspace-1" },
  });
}

function promoteMocks(profile: MockResponse) {
  return createSupabaseQueryMock({
    business_profiles: profile,
    campaign_assets: { data: { id: "asset-1" }, error: null },
    approval_items: { data: null, error: null },
    campaign_events: { data: null, error: null },
  });
}

describe("promoteAssetToCampaign", () => {
  it("inserts a pending asset + approval gate + asset_generated event", async () => {
    const supabase = promoteMocks({ data: null, error: null });

    const { assetId } = await promote(supabase, "copy");

    expect(assetId).toBe("asset-1");
    const [asset, gate, event] = inserts(supabase);
    expect(asset.status).toBe("pending_approval");
    expect(asset.dispatch_locked).toBe(true);
    expect(asset.tool_source).toBe("arc_saved");
    expect(asset.org_id).toBe("org-1");
    expect(gate.campaign_asset_id).toBe("asset-1");
    expect(gate.status).toBe("pending_approval");
    expect(gate.org_id).toBe("org-1");
    expect(event.event_type).toBe("asset_generated");
    expect(event.org_id).toBe("org-1");
  });

  it("routes copy containing a banned phrase to needs_compliance at blocked risk", async () => {
    const supabase = promoteMocks({ data: profileRow(), error: null });

    await promote(supabase, "Act now before it's too late.");

    const [asset, gate] = inserts(supabase);
    expect(gate.risk_level).toBe("blocked");
    expect(gate.status).toBe("needs_compliance");
    expect(gate.compliance_notes).toBeTruthy();
    expect(asset.status).toBe("needs_compliance");
    // The flag survives on the durable record so the approval card can render it.
    expect(asset.audit_payload).toMatchObject({
      outbound_locked: true,
      guardrail: { blocked_phrases: ["act now"] },
    });
  });

  it("keeps screened-clean copy at medium — the phrase screen cannot verify a claim", async () => {
    const supabase = promoteMocks({ data: profileRow(), error: null });

    await promote(supabase, "We restore water damage for Chicago landlords.");

    const [asset, gate] = inserts(supabase);
    expect(gate.risk_level).toBe("medium");
    expect(gate.status).toBe("pending_approval");
    expect(asset.status).toBe("pending_approval");
  });

  it("does not screen against a Brand Kit the operator has not activated", async () => {
    const supabase = promoteMocks({ data: profileRow({ status: "draft" }), error: null });

    await promote(supabase, "Act now before it's too late.");

    const [, gate] = inserts(supabase);
    expect(gate.risk_level).toBe("medium");
    expect(gate.status).toBe("pending_approval");
  });

  it("leaves an asset with no copy unscreened", async () => {
    const supabase = promoteMocks({ data: profileRow(), error: null });

    await promote(supabase, null);

    const [asset, gate] = inserts(supabase);
    expect(gate.risk_level).toBe("medium");
    expect(gate.compliance_notes).toBeUndefined();
    expect(asset.audit_payload).not.toHaveProperty("guardrail");
  });

  it("still creates the asset when the Brand Kit read fails", async () => {
    const supabase = promoteMocks({ data: null, error: { message: "boom" } });

    const { assetId } = await promote(supabase, "Act now before it's too late.");

    // Unscreened, but still gated: dispatch_locked + pending_approval hold the line.
    expect(assetId).toBe("asset-1");
    const [asset, gate] = inserts(supabase);
    expect(asset.dispatch_locked).toBe(true);
    expect(gate.status).toBe("pending_approval");
  });
});
