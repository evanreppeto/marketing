"use server";

import { revalidatePath } from "next/cache";

import { requireOperator } from "@/lib/auth/operator";
import { type ApprovalDecision, decideApprovalItem, undoDecision } from "@/lib/campaigns/decisions";
import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/server";

export type InboxActionState = { ok: boolean; message: string; undo?: { approvalItemId: string } } | null;

const INBOX_DECISIONS: ApprovalDecision[] = ["approved", "declined"];

function revalidateAfterDecision(campaignId: string) {
  revalidatePath("/");
  revalidatePath("/approvals");
  if (campaignId) revalidatePath(`/campaigns/${campaignId}`);
  revalidatePath("/campaigns");
}

/**
 * One-click approve/decline from the Today inbox. Real state transition; outbound
 * stays locked. Returns an `undo` handle so the client can offer a reversal toast.
 */
export async function decideFromInboxAction(_previous: InboxActionState, formData: FormData): Promise<InboxActionState> {
  await requireOperator();

  if (!isSupabaseAdminConfigured()) {
    return { ok: false, message: "Supabase isn't configured yet, so the decision can't be recorded." };
  }

  const approvalItemId = String(formData.get("approvalItemId") ?? "").trim();
  const campaignId = String(formData.get("campaignId") ?? "").trim();
  const decision = String(formData.get("decision") ?? "").trim();

  if (!approvalItemId) return { ok: false, message: "Missing approval item." };
  if (!INBOX_DECISIONS.includes(decision as ApprovalDecision)) {
    return { ok: false, message: "Inbox supports approve or decline only." };
  }

  const client = getSupabaseAdminClient();

  const { data: itemRow } = await client
    .from("approval_items")
    .select("risk_level")
    .eq("id", approvalItemId)
    .maybeSingle<{ risk_level: string | null }>();
  if (itemRow && /high|blocked/i.test(itemRow.risk_level ?? "")) {
    return { ok: false, message: "High-risk items must be reviewed inside the campaign before deciding." };
  }

  try {
    await decideApprovalItem(
      { approvalItemId, decision: decision as ApprovalDecision, operator: "Operator" },
      client,
    );
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Couldn't record the decision." };
  }

  revalidateAfterDecision(campaignId);
  const verb = decision === "approved" ? "Approved" : "Declined";
  return { ok: true, message: `${verb}. Outbound stays locked.`, undo: { approvalItemId } };
}

/**
 * Reverse the most recent inbox decision (append-only). Powers the undo toast.
 */
export async function undoInboxDecisionAction(_previous: InboxActionState, formData: FormData): Promise<InboxActionState> {
  await requireOperator();

  if (!isSupabaseAdminConfigured()) {
    return { ok: false, message: "Supabase isn't configured yet, so the undo can't be recorded." };
  }

  const approvalItemId = String(formData.get("approvalItemId") ?? "").trim();
  const campaignId = String(formData.get("campaignId") ?? "").trim();
  if (!approvalItemId) return { ok: false, message: "Missing approval item." };

  try {
    await undoDecision({ approvalItemId, operator: "Operator" }, getSupabaseAdminClient());
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Couldn't undo the decision." };
  }

  revalidateAfterDecision(campaignId);
  return { ok: true, message: "Decision undone." };
}
