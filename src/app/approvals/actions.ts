"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { APPROVAL_DECISION_ACTIONS, decideApprovalItem, type ApprovalDecisionAction } from "@/lib/approvals/decisions";
import { requireOperator } from "@/lib/auth/operator";

export async function decideApprovalItemAction(formData: FormData) {
  await requireOperator();

  const approvalItemId = getFormString(formData, "approvalItemId");
  const action = getFormString(formData, "decisionAction");
  const notes = getFormString(formData, "notes");
  const editedOutput = getFormString(formData, "editedOutput");

  if (!approvalItemId || !isApprovalDecisionAction(action)) {
    redirect("/approvals?action=error");
  }

  try {
    await decideApprovalItem({
      approvalItemId,
      action,
      reviewer: "Local Operator",
      notes,
      editedOutput,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Approval decision failed.";
    redirect(`/approvals?item=${approvalItemId}&action=error&message=${encodeURIComponent(message)}`);
  }

  revalidatePath("/approvals");
  revalidatePath("/");
  redirect(`/approvals?item=${approvalItemId}&action=${action}`);
}

function getFormString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function isApprovalDecisionAction(value: string | undefined): value is ApprovalDecisionAction {
  return APPROVAL_DECISION_ACTIONS.includes(value as ApprovalDecisionAction);
}
