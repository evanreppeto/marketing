import { describe, expect, it } from "vitest";

import { createSupabaseQueryMock } from "@/lib/repos/__tests__/test-helpers";

import { createCampaignFromOpportunity } from "./create";

function insertsFor(supabase: { calls: Array<[string, ...unknown[]]> }, table: string) {
  const out: Record<string, unknown>[] = [];
  for (let i = 0; i < supabase.calls.length; i++) {
    const [method, arg] = supabase.calls[i];
    if (method === "from" && arg === table && supabase.calls[i + 1]?.[0] === "insert") {
      out.push(supabase.calls[i + 1][1] as Record<string, unknown>);
    }
  }
  return out;
}

const LEAD_UUID = "11111111-2222-3333-4444-555555555555";

describe("createCampaignFromOpportunity", () => {
  it("writes a draft, launch-locked campaign seeded from the opportunity, plus a created event", async () => {
    const supabase = createSupabaseQueryMock({
      campaigns: { data: { id: "camp-9" }, error: null },
      campaign_events: { data: null, error: null },
    });

    const out = await createCampaignFromOpportunity({
      operator: "evan@test",
      name: "Oak Park water-damage fast-track",
      persona: "persona_homeowner_emergency",
      restorationFocus: "water_backup",
      objective: "Fast-track a same-day estimate with proof-of-work photos",
      audienceSummary: "Homeowner emergency — matched by Arc.",
      opportunity: {
        id: "opp-42",
        subjectType: "lead",
        subjectId: LEAD_UUID,
        confidence: 88,
        urgency: "high",
        recommendedAction: "Fast-track a same-day estimate with proof-of-work photos",
        recommendedCampaignType: null,
        evidence: { leadScore: 91, daysCold: 1 },
      },
      client: supabase,
      tenant: { org_id: "org-1", workspace_id: "workspace-1" },
    });

    expect(out.campaignId).toBe("camp-9");

    const campaign = insertsFor(supabase, "campaigns")[0];
    expect(campaign).toMatchObject({
      name: "Oak Park water-damage fast-track",
      persona: "persona_homeowner_emergency",
      restoration_focus: "water_backup",
      status: "draft",
      launch_locked: true,
      owner: "evan@test",
      source_system: "arc_opportunity",
      objective: "Fast-track a same-day estimate with proof-of-work photos",
      audience_summary: "Homeowner emergency — matched by Arc.",
      lead_id: LEAD_UUID,
      org_id: "org-1",
    });

    // Provenance stamp so the campaign reads as Arc-drafted from the opportunity.
    const signal = campaign.source_signal as Record<string, unknown>;
    expect(signal).toMatchObject({
      authored_by: "arc",
      origin: "opportunity",
      opportunity_id: "opp-42",
      subject_type: "lead",
      subject_id: LEAD_UUID,
      outbound_locked: true,
    });
    expect(signal.evidence).toMatchObject({ leadScore: 91, daysCold: 1 });

    const event = insertsFor(supabase, "campaign_events")[0];
    expect(event).toMatchObject({ campaign_id: "camp-9", event_type: "created", actor: "evan@test", org_id: "org-1" });
  });

  it("skips the CRM foreign key for non-CRM / non-UUID subjects (e.g. weather signals)", async () => {
    const supabase = createSupabaseQueryMock({
      campaigns: { data: { id: "camp-10" }, error: null },
      campaign_events: { data: null, error: null },
    });

    await createCampaignFromOpportunity({
      operator: "evan@test",
      name: "Riverside storm response",
      persona: "persona_homeowner_emergency",
      restorationFocus: "flood",
      objective: "Launch a geo-targeted storm-response campaign",
      opportunity: {
        id: "opp-weather",
        subjectType: "weather_event",
        subjectId: "demo-weather-riverside-flood",
        confidence: 92,
        urgency: "high",
        recommendedAction: "Launch a geo-targeted storm-response campaign",
        evidence: null,
      },
      client: supabase,
      tenant: { org_id: "org-1", workspace_id: "workspace-1" },
    });

    const campaign = insertsFor(supabase, "campaigns")[0];
    expect(campaign.lead_id).toBeUndefined();
    expect(campaign.company_id).toBeUndefined();
    // The subject linkage is still captured in provenance.
    expect((campaign.source_signal as Record<string, unknown>).subject_id).toBe("demo-weather-riverside-flood");
  });
});
