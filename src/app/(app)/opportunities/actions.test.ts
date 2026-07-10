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
import { executeOpportunityDraftTask } from "@/lib/opportunities/draft-package";
import { enqueueArcOpportunityTask } from "@/lib/opportunities/enqueue";
import { markOpportunityDrafted, markOpportunityDrafting } from "@/lib/opportunities/persistence";

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
