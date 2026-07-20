"use server";

import { revalidatePath } from "next/cache";

import { validateRevisionInstruction } from "@/domain";
import { getCurrentAgentTaskTenantFields } from "@/lib/agent-tasks/scope";
import { getOperatorActor, requireOperator } from "@/lib/auth/operator";
import { decideAsset, type ApprovalDecision } from "@/lib/campaigns/decisions";
import { editDraftAsset } from "@/lib/campaigns/draft-editing";
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
 * Persist an operator's in-canvas edit to a deliverable's copy (title / body).
 * Wraps `editDraftAsset`, which writes edited_body/edited_fields and logs an
 * `asset_edited` event — and never touches dispatch_locked/launch_locked, so
 * outbound stays locked. The read path coalesces edited_body, so the edit shows
 * immediately and feeds the revision diff. Lets the operator fix copy in place
 * instead of round-tripping every wording tweak through Arc. Gated by
 * requireOperator(). `persisted: false` is the honest offline/demo signal.
 */
export async function editCampaignDraftAction(input: {
  campaignId: string;
  assetId: string;
  title?: string;
  body?: string;
}): Promise<CampaignActionResult> {
  await requireOperator();
  if (!input.assetId) return { ok: false, error: "Missing asset." };

  const body = typeof input.body === "string" ? input.body.trim() : undefined;
  const title = typeof input.title === "string" ? input.title.trim() : undefined;
  if (!body && !title) return { ok: false, error: "Nothing to save." };

  if (!isSupabaseAdminConfigured()) return { ok: true, persisted: false, status: "edited" };

  try {
    const operator = await getOperatorActor();
    await editDraftAsset({ assetId: input.assetId, campaignId: input.campaignId, title, body, fields: {} }, operator);
    revalidatePath(`/campaigns/${input.campaignId}`);
    return { ok: true, persisted: true, status: "edited" };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not save your edit." };
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
