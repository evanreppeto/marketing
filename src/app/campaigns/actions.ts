"use server";

import { revalidatePath } from "next/cache";

import { RevisionInstructionError, validateRevisionInstruction } from "@/domain";
import { requireOperator } from "@/lib/auth/operator";
import { type ApprovalDecision, decideApprovalItem } from "@/lib/campaigns/decisions";
import { requestAssetRevision } from "@/lib/campaigns/revisions";
import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/server";

const DECISIONS: ApprovalDecision[] = ["approved", "declined", "archived"];

export type RevisionActionState = { ok: boolean; message: string } | null;

/**
 * Operator asks Mark to revise a specific campaign asset. Gated by the operator
 * check + Supabase config, validated through the domain, then persisted as a
 * real revision request (outbound stays locked). Shaped for `useActionState`.
 */
export async function requestRevisionAction(
  _previous: RevisionActionState,
  formData: FormData,
): Promise<RevisionActionState> {
  await requireOperator();

  if (!isSupabaseAdminConfigured()) {
    return { ok: false, message: "Supabase isn't configured yet, so Mark can't record the revision." };
  }

  const campaignId = String(formData.get("campaignId") ?? "").trim();
  const assetId = String(formData.get("assetId") ?? "").trim();

  if (!campaignId || !assetId) {
    return { ok: false, message: "Choose an asset for Mark to revise." };
  }

  let instruction: string;
  try {
    instruction = validateRevisionInstruction(formData.get("instruction"));
  } catch (error) {
    if (error instanceof RevisionInstructionError) {
      return { ok: false, message: error.message };
    }
    throw error;
  }

  try {
    await requestAssetRevision({ campaignId, assetId, instruction, operator: "Operator" }, getSupabaseAdminClient());
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Mark couldn't record the revision." };
  }

  revalidatePath(`/campaigns/${campaignId}`);
  revalidatePath("/campaigns");

  return {
    ok: true,
    message: "Sent to Mark. The asset is now 'revision requested'; outbound stays locked.",
  };
}

export type DecisionActionState = { ok: boolean; message: string } | null;

/**
 * Operator approves / declines / archives a campaign approval item. Gated, a
 * real backend state transition, and outbound stays locked. Shaped for
 * `useActionState`. The clicked submit button supplies `decision`.
 */
export async function decideApprovalAction(
  _previous: DecisionActionState,
  formData: FormData,
): Promise<DecisionActionState> {
  await requireOperator();

  if (!isSupabaseAdminConfigured()) {
    return { ok: false, message: "Supabase isn't configured yet, so the decision can't be recorded." };
  }

  const approvalItemId = String(formData.get("approvalItemId") ?? "").trim();
  const campaignId = String(formData.get("campaignId") ?? "").trim();
  const decision = String(formData.get("decision") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim() || undefined;

  if (!approvalItemId) {
    return { ok: false, message: "Missing approval item." };
  }
  if (!DECISIONS.includes(decision as ApprovalDecision)) {
    return { ok: false, message: "Unknown decision." };
  }

  try {
    await decideApprovalItem(
      { approvalItemId, decision: decision as ApprovalDecision, operator: "Operator", notes },
      getSupabaseAdminClient(),
    );
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Couldn't record the decision." };
  }

  if (campaignId) {
    revalidatePath(`/campaigns/${campaignId}`);
  }
  revalidatePath("/campaigns");

  const verb = decision === "approved" ? "approved" : decision === "declined" ? "declined" : "archived";
  return { ok: true, message: `Campaign ${verb}. Outbound stays locked.` };
}
