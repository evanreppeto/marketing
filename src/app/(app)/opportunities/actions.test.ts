import { beforeEach, describe, expect, it, vi } from "vitest";

const OPP = {
  id: "opp-1",
  title: "Re-engage cold lead",
  summary: "A property-manager lead has gone cold.",
  recommendedAction: "Send a vendor packet and book a walkthrough",
  urgency: "high" as const,
  persona: "persona_property_manager",
  subjectType: "lead",
  subjectId: "lead-1",
  confidence: 82,
  recommendedCampaignType: null,
  evidence: {},
};

vi.mock("@/lib/auth/operator", () => ({ requireOperator: vi.fn(async () => {}), getOperatorActor: vi.fn(async () => "evan") }));
vi.mock("@/lib/auth/workspace", () => ({ getCurrentWorkspaceContext: vi.fn(async () => ({ orgId: "org-1", workspaceId: "ws-1" })) }));
vi.mock("@/lib/supabase/server", () => ({ isSupabaseAdminConfigured: vi.fn(() => true) }));
vi.mock("@/lib/personas/read-model", () => ({
  getOrgPersonaKeys: vi.fn(async () => [
    "persona_homeowner_emergency", "persona_homeowner_preventative", "persona_homeowner_rebuild",
    "persona_landlord", "persona_hoa_board", "persona_property_manager", "persona_insurance_agent",
    "persona_listing_agent", "persona_buyers_agent", "persona_plumbing_partner",
    "persona_hvac_roof_electrical_partner", "persona_gc_remodeler_partner",
  ]),
}));
vi.mock("@/lib/campaigns/create", () => ({ createCampaignFromOpportunity: vi.fn(async () => ({ campaignId: "camp-1" })) }));
vi.mock("@/lib/opportunities/read-model", () => ({ getOpportunityForCampaign: vi.fn(async () => OPP) }));
vi.mock("@/lib/opportunities/enqueue", () => ({ enqueueArcOpportunityTask: vi.fn(async () => "task-1") }));
vi.mock("@/lib/opportunities/draft-package", () => ({
  executeOpportunityDraftTask: vi.fn(async () => ({ ok: true, status: "drafted", taskId: "task-1", campaignId: "camp-1", assetIds: ["a", "b", "c", "d"] })),
}));
vi.mock("@/lib/opportunities/persistence", () => ({
  markOpportunityDrafted: vi.fn(async () => ({ ok: true })),
  markOpportunityDrafting: vi.fn(async () => ({ ok: true })),
}));
vi.mock("@/lib/opportunities/detector", () => ({ runColdLeadDetection: vi.fn(async () => {}) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { isSupabaseAdminConfigured } from "@/lib/supabase/server";

import { askArcToDraftFromOpportunityAction, draftCampaignFromOpportunityAction } from "./actions";
import { createCampaignFromOpportunity } from "@/lib/campaigns/create";
import { executeOpportunityDraftTask } from "@/lib/opportunities/draft-package";
import { enqueueArcOpportunityTask } from "@/lib/opportunities/enqueue";
import { markOpportunityDrafted, markOpportunityDrafting } from "@/lib/opportunities/persistence";
import { getOpportunityForCampaign } from "@/lib/opportunities/read-model";

const INPUT = { opportunityId: "opp-1", name: "Storm reactivation", persona: "persona_property_manager", restorationFocus: "water_backup" };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(isSupabaseAdminConfigured).mockReturnValue(true);
});

describe("askArcToDraftFromOpportunityAction", () => {
  it("creates the campaign, enqueues a draft run, marks drafting, and executes it", async () => {
    const res = await askArcToDraftFromOpportunityAction(INPUT);
    expect(res).toMatchObject({ ok: true, persisted: true, campaignId: "camp-1", href: "/campaigns/camp-1" });

    expect(enqueueArcOpportunityTask).toHaveBeenCalledTimes(1);
    const enqueueArg = vi.mocked(enqueueArcOpportunityTask).mock.calls[0][0];
    expect(enqueueArg).toMatchObject({ opportunityId: "opp-1", campaignId: "camp-1" });
    expect(enqueueArg.brief).toMatchObject({ angle: OPP.recommendedAction, personaLabel: "Property Manager", focusLabel: "Water Backup", urgency: "high" });

    expect(markOpportunityDrafting).toHaveBeenCalledWith("opp-1", "task-1", undefined, { orgId: "org-1" });
    expect(executeOpportunityDraftTask).toHaveBeenCalledWith({ agentTaskId: "task-1", orgId: "org-1", agentName: "Arc" });
  });

  it("returns unpersisted offline without enqueuing anything", async () => {
    vi.mocked(isSupabaseAdminConfigured).mockReturnValue(false);
    const res = await askArcToDraftFromOpportunityAction(INPUT);
    expect(res).toEqual({ ok: true, persisted: false });
    expect(enqueueArcOpportunityTask).not.toHaveBeenCalled();
    expect(executeOpportunityDraftTask).not.toHaveBeenCalled();
  });

  it("rejects an invalid persona", async () => {
    const res = await askArcToDraftFromOpportunityAction({ ...INPUT, persona: "not_a_persona" });
    expect(res).toEqual({ ok: false, error: "Choose a persona for this campaign." });
    expect(enqueueArcOpportunityTask).not.toHaveBeenCalled();
  });
});

describe("draftCampaignFromOpportunityAction (operator shell)", () => {
  it("creates the campaign and marks it drafted WITHOUT an Arc run", async () => {
    const res = await draftCampaignFromOpportunityAction(INPUT);
    expect(res).toMatchObject({ ok: true, persisted: true, campaignId: "camp-1", href: "/campaigns/camp-1" });
    expect(markOpportunityDrafted).toHaveBeenCalledWith("opp-1", "camp-1", undefined, { orgId: "org-1" });
    expect(enqueueArcOpportunityTask).not.toHaveBeenCalled();
    expect(executeOpportunityDraftTask).not.toHaveBeenCalled();
  });
});

// --- BSR-357 hardening: validation, forge-proof provenance, and idempotency ---
// These exercise the shared createDraftCampaign core through the operator action.

describe("createDraftCampaign — input validation", () => {
  it("accepts a free-text campaign theme without requiring a restoration focus", async () => {
    const res = await draftCampaignFromOpportunityAction({
      opportunityId: "opp-1",
      name: "Customer reactivation",
      persona: "persona_property_manager",
      campaignTheme: "Win-back",
    });

    expect(res).toMatchObject({ ok: true, campaignId: "camp-1" });
    expect(createCampaignFromOpportunity).toHaveBeenCalledWith(expect.objectContaining({
      campaignTheme: "Win-back",
    }));
  });

  it("rejects a blank campaign name before touching the DB", async () => {
    const res = await draftCampaignFromOpportunityAction({ ...INPUT, name: "   " });
    expect(res).toEqual({ ok: false, error: "A campaign name is required." });
    expect(createCampaignFromOpportunity).not.toHaveBeenCalled();
  });

  it("rejects unassigned_persona (internal-only) the same as any invalid value", async () => {
    const res = await draftCampaignFromOpportunityAction({ ...INPUT, persona: "unassigned_persona" });
    expect(res).toEqual({ ok: false, error: "Choose a persona for this campaign." });
    expect(createCampaignFromOpportunity).not.toHaveBeenCalled();
  });

  it("rejects a restoration focus outside the enum", async () => {
    const res = await draftCampaignFromOpportunityAction({ ...INPUT, restorationFocus: "banana" });
    expect(res).toEqual({ ok: false, error: "Choose a focus for this campaign." });
    expect(createCampaignFromOpportunity).not.toHaveBeenCalled();
  });
});

describe("draftCampaignFromOpportunityAction — authoritative re-read + provenance", () => {
  it("re-reads org-scoped and seeds create() from the opp, not client input", async () => {
    await draftCampaignFromOpportunityAction(INPUT);

    // Authoritative read is org-scoped to the caller's workspace.
    expect(getOpportunityForCampaign).toHaveBeenCalledWith("opp-1", "org-1");

    // objective/subject/evidence come from the server re-read; the client only
    // supplied name/persona/focus.
    const arg = vi.mocked(createCampaignFromOpportunity).mock.calls[0][0];
    expect(arg).toMatchObject({
      operator: "evan",
      name: "Storm reactivation",
      persona: "persona_property_manager",
      restorationFocus: "water_backup",
      objective: OPP.recommendedAction,
      tenant: { org_id: "org-1", workspace_id: "ws-1" },
    });
    expect(arg.opportunity).toMatchObject({ id: "opp-1", subjectType: "lead", subjectId: "lead-1" });
  });

  it("errors when the opportunity can't be re-read in the caller's org", async () => {
    vi.mocked(getOpportunityForCampaign).mockResolvedValueOnce(null);
    const res = await draftCampaignFromOpportunityAction(INPUT);
    expect(res).toEqual({ ok: false, error: "That opportunity is no longer available." });
    expect(createCampaignFromOpportunity).not.toHaveBeenCalled();
  });

  it("surfaces a create failure as an error result instead of throwing", async () => {
    vi.mocked(createCampaignFromOpportunity).mockRejectedValueOnce(new Error("campaigns insert failed: boom"));
    const res = await draftCampaignFromOpportunityAction(INPUT);
    expect(res).toEqual({ ok: false, error: "campaigns insert failed: boom" });
  });
});

describe("idempotency — an already-drafted opportunity is not re-converted", () => {
  const drafted = { ...OPP, status: "drafted", campaignId: "camp-existing" };

  it("routes 'Create campaign' to the existing draft without creating a duplicate", async () => {
    vi.mocked(getOpportunityForCampaign).mockResolvedValueOnce(drafted);
    const res = await draftCampaignFromOpportunityAction(INPUT);
    expect(res).toEqual({ ok: true, persisted: true, campaignId: "camp-existing", href: "/campaigns/camp-existing" });
    expect(createCampaignFromOpportunity).not.toHaveBeenCalled();
    expect(markOpportunityDrafted).not.toHaveBeenCalled();
  });

  it("routes 'Ask Arc to draft' to the existing draft without a second package run", async () => {
    vi.mocked(getOpportunityForCampaign).mockResolvedValueOnce(drafted);
    const res = await askArcToDraftFromOpportunityAction(INPUT);
    expect(res).toEqual({ ok: true, persisted: true, campaignId: "camp-existing", href: "/campaigns/camp-existing" });
    expect(createCampaignFromOpportunity).not.toHaveBeenCalled();
    expect(enqueueArcOpportunityTask).not.toHaveBeenCalled();
    expect(executeOpportunityDraftTask).not.toHaveBeenCalled();
  });
});
