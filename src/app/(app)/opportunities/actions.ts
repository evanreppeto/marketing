"use server";

import { revalidatePath } from "next/cache";

import {
  buildCampaignSeedFromOpportunity,
  isOfficialPersonaMapping,
  RESTORATION_FOCUS_VALUES,
} from "@/domain";
import { getOperatorActor, requireOperator } from "@/lib/auth/operator";
import { getCurrentWorkspaceContext } from "@/lib/auth/workspace";
import { createCampaignFromOpportunity } from "@/lib/campaigns/create";
import { runColdLeadDetection } from "@/lib/opportunities/detector";
import { markOpportunityDrafted } from "@/lib/opportunities/persistence";
import { getOpportunityForCampaign } from "@/lib/opportunities/read-model";
import { isSupabaseAdminConfigured } from "@/lib/supabase/server";

/**
 * Operator-triggered opportunity scan: runs the deterministic cold-lead detector
 * over the current workspace's CRM and persists any new source-backed
 * opportunities, then refreshes the inbox. Org-scoped through the authenticated
 * request context (detector → listLeads() applies the org filter). Read-only
 * detection — nothing outbound, nothing drafted.
 */
export async function scanForOpportunitiesAction(): Promise<void> {
  if (!isSupabaseAdminConfigured()) return;
  // Ensures the caller is authenticated + establishes the org scope the detector reads.
  await getCurrentWorkspaceContext();
  await runColdLeadDetection().catch(() => {
    // Detection is best-effort; a failure just leaves the inbox unchanged.
  });
  revalidatePath("/opportunities");
}

/**
 * Convert a surfaced opportunity into an approval-gated campaign draft, seeded
 * with the opportunity's persona, evidence, recommended action (as the message
 * angle) and subject record, and provenance-stamped as Arc-drafted from that
 * opportunity. The operator confirms/adjusts the name, persona, and focus in the
 * modal; the authoritative evidence is re-read server-side so it can't be forged.
 *
 * Draft only — the campaign lands launch-locked in the approval gate. Nothing
 * outbound, nothing auto-sent. Mirrors createCampaign's offline contract:
 * `persisted: false` when Supabase isn't configured so the UI can respond
 * honestly without claiming a save.
 */
export type DraftCampaignFromOpportunityInput = {
  opportunityId: string;
  name: string;
  persona: string;
  restorationFocus: string;
};

export type DraftCampaignFromOpportunityResult =
  | { ok: true; persisted: boolean; campaignId?: string; href?: string }
  | { ok: false; error: string };

export async function draftCampaignFromOpportunityAction(
  input: DraftCampaignFromOpportunityInput,
): Promise<DraftCampaignFromOpportunityResult> {
  await requireOperator();

  const name = input.name?.trim();
  const persona = input.persona?.trim();
  const focus = input.restorationFocus?.trim();
  if (!name) return { ok: false, error: "A campaign name is required." };
  if (!persona || !isOfficialPersonaMapping(persona)) {
    return { ok: false, error: "Choose a persona for this campaign." };
  }
  if (!focus || !(RESTORATION_FOCUS_VALUES as readonly string[]).includes(focus)) {
    return { ok: false, error: "Choose a focus for this campaign." };
  }

  const actor = await getOperatorActor();

  // Offline/demo: no DB to write to. Report success-but-unpersisted so the inbox
  // can confirm the draft without claiming it saved.
  if (!isSupabaseAdminConfigured()) return { ok: true, persisted: false };

  const ctx = await getCurrentWorkspaceContext();
  const opp = await getOpportunityForCampaign(input.opportunityId, ctx.orgId).catch(() => null);
  if (!opp) return { ok: false, error: "That opportunity is no longer available." };

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

    // Link the campaign back + advance the opportunity so it reads as drafted.
    // Best-effort: the campaign already exists, so a link failure must not fail
    // the whole conversion.
    await markOpportunityDrafted(opp.id, campaignId, undefined, { orgId: ctx.orgId }).catch(() => {});

    revalidatePath("/opportunities");
    revalidatePath("/campaigns");
    return { ok: true, persisted: true, campaignId, href: `/campaigns/${campaignId}` };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not create the campaign." };
  }
}
