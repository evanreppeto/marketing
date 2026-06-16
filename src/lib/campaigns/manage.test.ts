import { describe, expect, it, vi } from "vitest";

import { createSupabaseQueryMock } from "@/lib/repos/__tests__/test-helpers";

import { addCampaignPhotos, updateOperatorCampaign } from "./manage";

function insertsFor(supabase: { calls: Array<[string, ...unknown[]]> }, table: string) {
  const out: Record<string, unknown>[] = [];
  for (let i = 0; i < supabase.calls.length; i++) {
    const [m, a] = supabase.calls[i];
    if (m === "from" && a === table && supabase.calls[i + 1]?.[0] === "insert") out.push(supabase.calls[i + 1][1] as Record<string, unknown>);
  }
  return out;
}
function updatesFor(supabase: { calls: Array<[string, ...unknown[]]> }, table: string) {
  const out: Record<string, unknown>[] = [];
  for (let i = 0; i < supabase.calls.length; i++) {
    const [m, a] = supabase.calls[i];
    if (m === "from" && a === table && supabase.calls[i + 1]?.[0] === "update") out.push(supabase.calls[i + 1][1] as Record<string, unknown>);
  }
  return out;
}

const operatorDraft = { id: "camp-1", source_system: "operator", launch_locked: true };

describe("addCampaignPhotos", () => {
  it("appends an approved asset + approval + event per photo", async () => {
    // The query mock returns one canned shape per table, so campaign_assets must be an
    // object the asset insert can read its id back from. Index-continuation past existing
    // rows is handled in prod by Array.isArray(existing).length (real selects return arrays).
    const supabase = createSupabaseQueryMock({
      campaigns: { data: operatorDraft, error: null },
      campaign_assets: { data: { id: "asset-1" }, error: null },
      approval_items: { data: { id: "appr-9" }, error: null },
      approval_decisions: { data: null, error: null },
      campaign_events: { data: null, error: null },
    });
    const uploader = vi.fn(async (path: string) => `https://cdn.test/${path}`);
    const out = await addCampaignPhotos({
      campaignId: "camp-1",
      operator: "evan@test",
      photos: [{ filename: "x.png", contentType: "image/png", bytes: new Uint8Array([1]) }],
      client: supabase,
      uploader,
    });
    expect(uploader).toHaveBeenCalledWith("operator-campaigns/camp-1/0-x.png", expect.anything(), "image/png");
    expect(insertsFor(supabase, "campaign_assets")[0]).toMatchObject({ campaign_id: "camp-1", status: "approved" });
    expect(insertsFor(supabase, "approval_items")[0]).toMatchObject({ campaign_asset_id: "asset-1", status: "approved" });
    expect(insertsFor(supabase, "campaign_events")[0]).toMatchObject({ event_type: "asset_generated" });
    expect(out.assetIds).toEqual(["asset-1"]);
  });

  it("rejects a non-operator campaign", async () => {
    const supabase = createSupabaseQueryMock({ campaigns: { data: { id: "c", source_system: "arc_agent_orchestrator", launch_locked: true }, error: null } });
    await expect(addCampaignPhotos({ campaignId: "c", operator: "e", photos: [], client: supabase, uploader: vi.fn() })).rejects.toThrow(/operator/i);
  });
});

describe("updateOperatorCampaign", () => {
  it("updates the editable fields on an operator draft", async () => {
    const supabase = createSupabaseQueryMock({
      campaigns: { data: operatorDraft, error: null },
      campaign_events: { data: null, error: null },
    });
    await updateOperatorCampaign({
      campaignId: "camp-1",
      operator: "evan@test",
      fields: { name: "New name", audienceSummary: "aud", objective: undefined, offerSummary: undefined },
      client: supabase,
    });
    expect(updatesFor(supabase, "campaigns")[0]).toMatchObject({ name: "New name", audience_summary: "aud", objective: null, offer_summary: null });
  });

  it("rejects a launched campaign", async () => {
    const supabase = createSupabaseQueryMock({ campaigns: { data: { id: "c", source_system: "operator", launch_locked: false }, error: null } });
    await expect(updateOperatorCampaign({ campaignId: "c", operator: "e", fields: { name: "x" }, client: supabase })).rejects.toThrow(/draft|live|launch/i);
  });
});
