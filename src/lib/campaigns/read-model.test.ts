import { describe, expect, it } from "vitest";

import { createSupabaseQueryMock } from "@/lib/repos/__tests__/test-helpers";

import { buildReasoning, getCampaignWorkspaceDetail, getCampaignWorkspaceList } from "./read-model";

// buildReasoning only reads a handful of fields; cast minimal fixtures to the
// row shapes to keep the test focused on the distillation logic.
function campaign(reasoning: unknown, audit: unknown = {}) {
  return { reasoning_payload: reasoning, audit_payload: audit } as never;
}

function asset(toolSource: string | null, promptInputs: unknown = {}) {
  return { tool_source: toolSource, prompt_inputs: promptInputs } as never;
}

describe("buildReasoning", () => {
  it("distills why/action/flags/tools/prompt-inputs from Mark's payloads", () => {
    const result = buildReasoning(
      campaign(
        {
          why_hermes_created_it: "Referral persona with water-loss signals.",
          recommended_action: "Approve the first-touch outreach asset.",
          guardrail_flags: ["Human review required", "Outbound locked until approved"],
        },
        { provider: "local_deterministic" },
      ),
      [
        asset("Hermes Orchestrator", { persona: "persona_plumbing_partner", channel: "email", target_id: "x" }),
        asset("Hermes Orchestrator"),
      ],
    );

    expect(result.whyBuilt).toContain("Referral persona");
    expect(result.recommendedAction).toContain("Approve");
    expect(result.guardrailFlags).toHaveLength(2);
    // tool_source dedupes; audit provider is humanized and included
    expect(result.toolsUsed).toEqual(["Hermes Orchestrator", "Local Deterministic"]);
    // readable scalar prompt inputs only, *_id keys filtered out
    expect(result.promptInputs.map((p) => p.label)).toEqual(["Persona", "Channel"]);
  });

  it("falls back gracefully when nothing is recorded", () => {
    const result = buildReasoning(campaign({}, {}), [asset(null)]);
    expect(result.whyBuilt).toMatch(/not recorded reasoning/i);
    expect(result.guardrailFlags).toEqual([]);
    expect(result.toolsUsed).toEqual([]);
    expect(result.promptInputs).toEqual([]);
  });
});

describe("getCampaignWorkspaceDetail creative media", () => {
  it("renders a media_assets payload as a categorized, previewable asset", async () => {
    const supabase = createSupabaseQueryMock({
      campaigns: {
        data: {
          id: "camp-1",
          name: "Plumbing Partner",
          persona: "persona_plumbing_partner",
          restoration_focus: "water_backup",
          status: "pending_approval",
          company_id: null,
          contact_id: null,
          lead_id: null,
          owner: "Mark",
          objective: "Referral campaign",
          audience_summary: null,
          offer_summary: null,
          compliance_notes: null,
          launch_locked: true,
          source_signal: {},
          reasoning_payload: {},
          audit_payload: {},
          created_at: "2026-06-02T12:00:00.000Z",
          updated_at: "2026-06-02T12:00:00.000Z",
        },
        error: null,
      },
      campaign_assets: {
        data: [
          {
            id: "asset-img",
            campaign_id: "camp-1",
            asset_type: "image_prompt",
            channel: "image",
            title: "Hero image",
            status: "pending_owner_approval",
            tool_source: "Hermes Orchestrator",
            prompt_input: null,
            prompt_inputs: {},
            draft_body: null,
            edited_body: null,
            approved_body: null,
            dispatch_locked: true,
            compliance_notes: null,
            reasoning_payload: {},
            audit_payload: { media_assets: [{ url: "https://cdn.example/hero.png", type: "image", title: "Hero" }] },
            created_at: "2026-06-02T12:00:00.000Z",
            updated_at: "2026-06-02T12:00:00.000Z",
          },
        ],
        error: null,
      },
    });

    const detail = await getCampaignWorkspaceDetail("camp-1", supabase);

    expect(detail.status).toBe("live");
    if (detail.status !== "live") return;

    const asset = detail.assets[0];
    expect(asset.category).toBe("media");
    expect(asset.media[0]).toMatchObject({ type: "image", url: "https://cdn.example/hero.png" });
    expect(detail.metrics.media).toBeGreaterThan(0);
  });

  it("turns structured candidate JSON into human-readable campaign copy", async () => {
    const supabase = createSupabaseQueryMock({
      campaigns: {
        data: {
          id: "camp-1",
          name: "Insurance Partner",
          persona: "persona_insurance_agent",
          restoration_focus: "water_damage",
          status: "pending_approval",
          company_id: null,
          contact_id: null,
          lead_id: null,
          owner: "Mark",
          objective: "Referral campaign",
          audience_summary: null,
          offer_summary: null,
          compliance_notes: null,
          launch_locked: true,
          source_signal: {},
          reasoning_payload: {},
          audit_payload: {},
          created_at: "2026-06-02T12:00:00.000Z",
          updated_at: "2026-06-02T12:00:00.000Z",
        },
        error: null,
      },
      campaign_assets: {
        data: [
          {
            id: "asset-candidates",
            campaign_id: "camp-1",
            asset_type: "partner_lead_list",
            channel: "review",
            title: "Insurance partner candidates",
            status: "pending_owner_approval",
            tool_source: "Mark",
            prompt_input: null,
            prompt_inputs: {},
            draft_body: JSON.stringify({
              bucket: "insurance_partner",
              candidate_count: 1,
              top_candidates: [
                {
                  company_id: "hidden-company-id",
                  lead_id: "hidden-lead-id",
                  name: "Lakeview Insurance",
                  score: 94,
                  website: "https://lakeviewins.com/",
                  phone: "773-871-8000",
                  confidence: "high",
                  notes: "Strong fit for homeowner and condo claim referral relationships in Chicago.",
                },
              ],
              dispatch_locked: true,
            }),
            edited_body: null,
            approved_body: null,
            dispatch_locked: true,
            compliance_notes: null,
            reasoning_payload: {},
            audit_payload: {},
            created_at: "2026-06-02T12:00:00.000Z",
            updated_at: "2026-06-02T12:00:00.000Z",
          },
        ],
        error: null,
      },
    });

    const detail = await getCampaignWorkspaceDetail("camp-1", supabase);

    expect(detail.status).toBe("live");
    if (detail.status !== "live") return;

    expect(detail.assets[0].body).toContain("Lakeview Insurance");
    expect(detail.assets[0].body).toContain("Score: 94");
    expect(detail.assets[0].body).toContain("Phone: 773-871-8000");
    expect(detail.assets[0].body).not.toContain("hidden-company-id");
    expect(detail.assets[0].body).not.toContain("hidden-lead-id");
  });
});

const ROLLUP_CAMPAIGN = {
  id: "camp-1",
  name: "Spring Flood Recovery",
  persona: "persona_property_manager",
  restoration_focus: "water_backup",
  status: "pending_approval",
  company_id: null,
  contact_id: null,
  lead_id: null,
  owner: "Mark",
  objective: "Pre-approve vendor",
  audience_summary: null,
  offer_summary: null,
  compliance_notes: null,
  launch_locked: true,
  source_signal: {},
  reasoning_payload: {},
  audit_payload: {},
  created_at: "2026-06-02T12:00:00.000Z",
  updated_at: "2026-06-02T12:00:00.000Z",
};

function rollupAsset(id: string, assetType: string) {
  return {
    id,
    campaign_id: "camp-1",
    asset_type: assetType,
    channel: assetType,
    title: id,
    status: "pending_approval",
    tool_source: "creative_generator",
    prompt_input: null,
    prompt_inputs: {},
    draft_body: "Draft body",
    edited_body: null,
    approved_body: null,
    dispatch_locked: true,
    compliance_notes: null,
    reasoning_payload: {},
    audit_payload: {},
    created_at: "2026-06-02T12:00:00.000Z",
    updated_at: "2026-06-02T12:00:00.000Z",
  };
}

function rollupApproval(id: string, assetId: string, status: string) {
  return {
    id,
    campaign_id: "camp-1",
    campaign_asset_id: assetId,
    company_id: null,
    contact_id: null,
    lead_id: null,
    item_type: "email_campaign_asset",
    status,
    locked_until_approved: true,
    prompt_inputs: {},
    draft_output: "Draft body",
    edited_output: null,
    requested_by: "hermes",
    submitted_at: "2026-06-02T12:00:00.000Z",
    risk_level: "low",
    compliance_notes: null,
    decision_notes: null,
    reasoning_payload: {},
    audit_payload: {},
    created_at: "2026-06-02T12:00:00.000Z",
    updated_at: "2026-06-02T12:00:00.000Z",
  };
}

// One approved asset, one with a real pending approval decision, and one with
// no approval item (Mark drafted it but never submitted it for a decision).
const ROLLUP_ASSETS = [
  rollupAsset("asset-email", "email"),
  rollupAsset("asset-landing", "landing_page"),
  rollupAsset("asset-draft", "sms"),
];

const ROLLUP_APPROVALS = [
  rollupApproval("appr-email", "asset-email", "approved"),
  rollupApproval("appr-landing", "asset-landing", "pending_approval"),
];

describe("getCampaignWorkspaceDetail rollup", () => {
  it("counts pending decisions, not pending pieces (no-approval assets are draft)", async () => {
    const supabase = createSupabaseQueryMock({
      campaigns: { data: ROLLUP_CAMPAIGN, error: null },
      campaign_assets: { data: ROLLUP_ASSETS, error: null },
      approval_items: { data: ROLLUP_APPROVALS, error: null },
    });

    const detail = await getCampaignWorkspaceDetail("camp-1", supabase);

    expect(detail.status).toBe("live");
    if (detail.status !== "live") return;

    const rollup = detail.campaign.rollup;
    expect(rollup.approved).toBe(1); // asset-email: approved approval wins over its pending asset row
    expect(rollup.pending).toBe(1); // asset-landing: a real pending approval decision
    expect(rollup.draft).toBe(1); // asset-draft: no approval item -> draft, NOT pending
    expect(rollup.total).toBe(3);
    expect(rollup.state).toBe("needs_review");
    expect(rollup.label).toBe("Needs your review · 1 pending");
  });
});

describe("getCampaignWorkspaceList rollup", () => {
  it("counts pending decisions on list items (no-approval assets are draft)", async () => {
    const supabase = createSupabaseQueryMock({
      campaigns: { data: [ROLLUP_CAMPAIGN], error: null },
      campaign_assets: { data: ROLLUP_ASSETS, error: null },
      approval_items: { data: ROLLUP_APPROVALS, error: null },
    });

    const list = await getCampaignWorkspaceList(supabase);

    expect(list.status).toBe("live");
    if (list.status !== "live") return;

    const item = list.campaigns.find((campaign) => campaign.id === "camp-1");
    expect(item?.rollup.approved).toBe(1); // approved approval wins over the asset's pending row
    expect(item?.rollup.pending).toBe(1); // one real pending decision
    expect(item?.rollup.draft).toBe(1); // no-approval asset -> draft
    expect(item?.rollup.total).toBe(3);
    expect(item?.rollup.state).toBe("needs_review");
  });
});
