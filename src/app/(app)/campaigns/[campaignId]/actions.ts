"use server";

import { revalidatePath } from "next/cache";

import { validateRevisionInstruction } from "@/domain";
import { getCurrentAgentTaskTenantFields } from "@/lib/agent-tasks/scope";
import { getOperatorActor, requireOperator } from "@/lib/auth/operator";
import { decideAsset, type ApprovalDecision } from "@/lib/campaigns/decisions";
import { requestAssetRevision } from "@/lib/campaigns/revisions";
import { isSupabaseAdminConfigured } from "@/lib/supabase/server";

/**
 * Operator decisions on a campaign deliverable — the ContentEngine approval flow.
 * These are real backend state transitions (approve / decline / archive / request
 * revision), gated by requireOperator() and org-scoped. They never unlock
 * outbound dispatch; launching is a separate step. `persisted: false` is the
 * honest offline/demo signal so the UI can reflect the decision without saving.
 */
export type CampaignActionResult = { ok: true; persisted: boolean; status?: string } | { ok: false; error: string };

const DECISIONS: ReadonlySet<string> = new Set(["approved", "declined", "archived"]);

export async function decideCampaignAsset(campaignId: string, assetId: string, decision: string): Promise<CampaignActionResult> {
  await requireOperator();
  if (!DECISIONS.has(decision)) return { ok: false, error: "Unknown decision." };

  if (!isSupabaseAdminConfigured()) return { ok: true, persisted: false, status: decision };

  try {
    const operator = await getOperatorActor();
    const tenant = await getCurrentAgentTaskTenantFields();
    const result = await decideAsset({ assetId, campaignId, decision: decision as ApprovalDecision, operator, tenant });
    revalidatePath(`/campaigns/${campaignId}`);
    return { ok: true, persisted: true, status: result.status };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not record the decision." };
  }
}

export async function requestCampaignRevision(campaignId: string, assetId: string, instruction: string): Promise<CampaignActionResult> {
  await requireOperator();

  let cleaned: string;
  try {
    cleaned = validateRevisionInstruction(instruction);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Tell Arc what to change." };
  }

  if (!isSupabaseAdminConfigured()) return { ok: true, persisted: false, status: "revision_requested" };

  try {
    const operator = await getOperatorActor();
    await requestAssetRevision({ campaignId, assetId, instruction: cleaned, operator });
    revalidatePath(`/campaigns/${campaignId}`);
    return { ok: true, persisted: true, status: "revision_requested" };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not request the revision." };
  }
}
