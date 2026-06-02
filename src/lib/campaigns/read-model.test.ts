import { describe, expect, it } from "vitest";

import { createSupabaseQueryMock } from "@/lib/repos/__tests__/test-helpers";

import { buildReasoning, getCampaignWorkspaceDetail } from "./read-model";

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
