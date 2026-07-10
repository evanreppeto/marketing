"use server";

import { revalidatePath } from "next/cache";

import {
  buildCampaignSeedFromOpportunity,
  isOfficialPersonaMapping,
  type OpportunityPackageBrief,
  RESTORATION_FOCUS_VALUES,
} from "@/domain";
import { getOperatorActor, requireOperator } from "@/lib/auth/operator";
import { getCurrentWorkspaceContext } from "@/lib/auth/workspace";
import { createCampaignFromOpportunity } from "@/lib/campaigns/create";
import {
  runColdLeadDetection,
  runCompetitorSignalDetection,
  runWeatherEventDetection,
} from "@/lib/opportunities/detector";
import { executeOpportunityDraftTask } from "@/lib/opportunities/draft-package";
import { enqueueArcOpportunityTask } from "@/lib/opportunities/enqueue";
import { markOpportunityDrafted, markOpportunityDrafting } from "@/lib/opportunities/persistence";
import { getOpportunityForCampaign } from "@/lib/opportunities/read-model";
import { isSupabaseAdminConfigured } from "@/lib/supabase/server";

/**
 * Operator-triggered opportunity scan: runs the deterministic detectors over the
 * current workspace's signals and persists any new source-backed opportunities,
 * then refreshes the inbox. Three sources today — cold CRM leads, active weather
 * alerts (geo-targeted storm response), and captured competitor flights (defensive
 * response). Org-scoped through the authenticated request context. Each detector
 * is best-effort so one failing source can't sink the whole scan. Read-only
 * detection — nothing outbound, nothing drafted.
 */
export async function scanForOpportunitiesAction(): Promise<void> {
  if (!isSupabaseAdminConfigured()) return;
  // Ensures the caller is authenticated + establishes the org scope the detectors read.
  await getCurrentWorkspaceContext();
  const swallow = () => {
    // Detection is best-effort; a failing source just leaves the inbox unchanged.
  };
  await Promise.all([
    runColdLeadDetection().catch(swallow),
    runWeatherEventDetection().catch(swallow),
    runCompetitorSignalDetection().catch(swallow),
  ]);
  revalidatePath("/opportunities");
}

export type DraftCampaignFromOpportunityInput = {
  opportunityId: string;
  name: string;
  persona: string;
  restorationFocus: string;
};

export type DraftCampaignFromOpportunityResult =
  | { ok: true; persisted: boolean; campaignId?: string; href?: string }
  | { ok: false; error: string };

/** `persona_property_manager` / `water_backup` → "Property Manager" / "Water Backup". */
function humanizeKey(key: string): string {
  return key.replace(/^persona_/, "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

type PreparedDraft =
  | { status: "error"; error: string }
  | { status: "offline" }
  | {
      status: "created";
      campaignId: string;
      ctx: { orgId: string; workspaceId: string };
      actor: string;
      persona: string;
      focus: string;
      opp: {
        id: string;
        subjectType: string;
        urgency: "low" | "medium" | "high";
        recommendedAction: string;
        title: string;
      };
    };

/**
 * Shared core for both inbox draft actions: validate, re-read the authoritative
 * opportunity server-side (so evidence can't be forged), and create the
 * approval-gated, launch-locked campaign draft (provenance-stamped as
 * Arc-drafted). Returns `offline` when Supabase isn't configured so the UI can
 * confirm without claiming a save. Draft only — nothing outbound.
 */
async function createDraftCampaign(input: DraftCampaignFromOpportunityInput): Promise<PreparedDraft> {
  await requireOperator();

  const name = input.name?.trim();
  const persona = input.persona?.trim();
  const focus = input.restorationFocus?.trim();
  if (!name) return { status: "error", error: "A campaign name is required." };
  if (!persona || !isOfficialPersonaMapping(persona)) {
    return { status: "error", error: "Choose a persona for this campaign." };
  }
  if (!focus || !(RESTORATION_FOCUS_VALUES as readonly string[]).includes(focus)) {
    return { status: "error", error: "Choose a focus for this campaign." };
  }

  const actor = await getOperatorActor();
  if (!isSupabaseAdminConfigured()) return { status: "offline" };

  const ctx = await getCurrentWorkspaceContext();
  const opp = await getOpportunityForCampaign(input.opportunityId, ctx.orgId).catch(() => null);
  if (!opp) return { status: "error", error: "That opportunity is no longer available." };

  try {
    const seed = buildCampaignSeedFromOpportunity({
      title: opp.title,
      summary: opp.summary,
      recommendedAction: opp.recommendedAction,
      urgency: opp.urgency,
      persona: opp.persona,
      recommendedCampaignType: opp.recommendedCampaignType,
    });

    const { campaignId } = await createCampaignFromOpportunity({
      operator: actor,
      name,
      persona,
      restorationFocus: focus,
      objective: opp.recommendedAction,
      audienceSummary: seed.audienceSummary,
      opportunity: {
        id: opp.id,
        subjectType: opp.subjectType,
        subjectId: opp.subjectId,
        confidence: opp.confidence,
        urgency: opp.urgency,
        recommendedAction: opp.recommendedAction,
        recommendedCampaignType: opp.recommendedCampaignType,
        evidence: opp.evidence,
      },
      tenant: { org_id: ctx.orgId, workspace_id: ctx.workspaceId ?? "" },
    });

    return {
      status: "created",
      campaignId,
      ctx: { orgId: ctx.orgId, workspaceId: ctx.workspaceId ?? "" },
      actor,
      persona,
      focus,
      opp: { id: opp.id, subjectType: opp.subjectType, urgency: opp.urgency, recommendedAction: opp.recommendedAction, title: name },
    };
  } catch (error) {
    return { status: "error", error: error instanceof Error ? error.message : "Could not create the campaign." };
  }
}

/**
 * "Create campaign" — convert the opportunity into an operator-owned draft shell.
 * The campaign lands launch-locked in the approval gate; the operator builds the
 * assets. The opportunity reads as `drafted`. Nothing outbound.
 */
export async function draftCampaignFromOpportunityAction(
  input: DraftCampaignFromOpportunityInput,
): Promise<DraftCampaignFromOpportunityResult> {
  const prepared = await createDraftCampaign(input);
  if (prepared.status === "error") return { ok: false, error: prepared.error };
  if (prepared.status === "offline") return { ok: true, persisted: false };

  // Link the campaign back + advance the opportunity so it reads as drafted.
  // Best-effort: the campaign already exists, so a link failure must not fail it.
  await markOpportunityDrafted(prepared.opp.id, prepared.campaignId, undefined, { orgId: prepared.ctx.orgId }).catch(() => {});

  revalidatePath("/opportunities");
  revalidatePath("/campaigns");
  return { ok: true, persisted: true, campaignId: prepared.campaignId, href: `/campaigns/${prepared.campaignId}` };
}

/**
 * "Ask Arc to draft" — create the same draft campaign, then enqueue an
 * approval-gated Arc draft run that fills it with a starter package (email, SMS,
 * paid, landing) as pending-approval assets, and execute that run inline so the
 * operator returns to a populated, review-ready package. The opportunity passes
 * through `drafting`. Every generated asset is dispatch-locked — nothing sends.
 */
export async function askArcToDraftFromOpportunityAction(
  input: DraftCampaignFromOpportunityInput,
): Promise<DraftCampaignFromOpportunityResult> {
  const prepared = await createDraftCampaign(input);
  if (prepared.status === "error") return { ok: false, error: prepared.error };
  if (prepared.status === "offline") return { ok: true, persisted: false };

  const { campaignId, ctx, actor, persona, focus, opp } = prepared;
  const brief: OpportunityPackageBrief = {
    title: opp.title,
    angle: opp.recommendedAction,
    personaLabel: humanizeKey(persona),
    focusLabel: humanizeKey(focus),
    urgency: opp.urgency,
    subjectLabel: opp.subjectType ? humanizeKey(opp.subjectType) : undefined,
  };

  try {
    const taskId = await enqueueArcOpportunityTask({
      opportunityId: opp.id,
      objective: `Draft a campaign package for: ${opp.recommendedAction}`,
      operator: actor,
      campaignId,
      brief,
    });
    // Reads as "drafting" while the run is in flight, then the executor flips it
    // to "drafted" once the package lands.
    await markOpportunityDrafting(opp.id, taskId, undefined, { orgId: ctx.orgId }).catch(() => {});
    await executeOpportunityDraftTask({ agentTaskId: taskId, orgId: ctx.orgId, agentName: "Arc" });
  } catch {
    // No Arc agent registered (or the run failed): the draft shell still exists,
    // so settle the opportunity as drafted rather than leaving it stuck.
    await markOpportunityDrafted(opp.id, campaignId, undefined, { orgId: ctx.orgId }).catch(() => {});
  }

  revalidatePath("/opportunities");
  revalidatePath("/campaigns");
  revalidatePath(`/campaigns/${campaignId}`);
  return { ok: true, persisted: true, campaignId, href: `/campaigns/${campaignId}` };
}
