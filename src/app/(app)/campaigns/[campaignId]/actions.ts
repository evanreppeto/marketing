"use server";

import { revalidatePath } from "next/cache";

import { validateRevisionInstruction } from "@/domain";
import { getCurrentAgentTaskTenantFields } from "@/lib/agent-tasks/scope";
import { getOperatorActor, requireOperator } from "@/lib/auth/operator";
import { decideAsset, type ApprovalDecision } from "@/lib/campaigns/decisions";
import { launchCampaign } from "@/lib/campaigns/launch";
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

export type LaunchCampaignActionResult =
  | { ok: true; persisted: boolean; launchedAssets?: number }
  | { ok: false; error: string };

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

/**
 * Launch a campaign — the explicit, deliberate outbound gate. `launchCampaign`
 * enforces that every gating deliverable is already approved; this unlocks the
 * approved pieces for dispatch, marks the campaign live, and opens the Outbox.
 * It never sends anything on its own: each queued dispatch is still confirmed
 * by the operator in the Outbox. Gated by requireOperator() and org-scoped.
 */
export async function launchCampaignAction(campaignId: string): Promise<LaunchCampaignActionResult> {
  await requireOperator();

  if (!isSupabaseAdminConfigured()) return { ok: true, persisted: false };

  try {
    const operator = await getOperatorActor();
    const tenant = await getCurrentAgentTaskTenantFields();
    const result = await launchCampaign({ campaignId, operator, tenant });
    revalidatePath(`/campaigns/${campaignId}`);
    revalidatePath("/campaigns");
    revalidatePath("/outbox");
    return { ok: true, persisted: true, launchedAssets: result.launchedAssets };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not launch the campaign." };
  }
}
