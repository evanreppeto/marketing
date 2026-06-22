"use server";

import { revalidatePath } from "next/cache";

import { getOperatorActor, requireOperator } from "@/lib/auth/operator";
import { transitionDispatch } from "@/lib/dispatch/persistence";
import { type DispatchStatus } from "@/lib/dispatch/status";
import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/server";

export type DispatchActionState = { ok: boolean; message: string } | null;

const SUCCESS: Partial<Record<DispatchStatus, string>> = {
  sent: "Arced sent.",
  delivered: "Arced delivered.",
  failed: "Arced failed — left in the Outbox for follow-up.",
  canceled: "Dispatch canceled.",
  scheduled: "Scheduled.",
};

async function runTransition(formData: FormData, to: DispatchStatus): Promise<DispatchActionState> {
  await requireOperator();
  if (!isSupabaseAdminConfigured()) {
    return { ok: false, message: "Supabase isn't configured yet, so the Outbox can't update." };
  }

  const dispatchId = String(formData.get("dispatchId") ?? "").trim();
  if (!dispatchId) return { ok: false, message: "Missing dispatch." };

  const note = String(formData.get("note") ?? "").trim() || undefined;
  const scheduledFor = String(formData.get("scheduledFor") ?? "").trim() || undefined;

  try {
    await transitionDispatch({ dispatchId, to, operator: await getOperatorActor(), note, scheduledFor }, getSupabaseAdminClient());
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Couldn't update the dispatch." };
  }

  revalidatePath("/outbox");
  const campaignId = String(formData.get("campaignId") ?? "").trim();
  if (campaignId) revalidatePath(`/campaigns/${campaignId}`);

  return { ok: true, message: SUCCESS[to] ?? "Updated." };
}

export async function markDispatchSentAction(_prev: DispatchActionState, formData: FormData) {
  return runTransition(formData, "sent");
}
export async function markDispatchDeliveredAction(_prev: DispatchActionState, formData: FormData) {
  return runTransition(formData, "delivered");
}
export async function markDispatchFailedAction(_prev: DispatchActionState, formData: FormData) {
  return runTransition(formData, "failed");
}
export async function cancelDispatchAction(_prev: DispatchActionState, formData: FormData) {
  return runTransition(formData, "canceled");
}
export async function scheduleDispatchAction(_prev: DispatchActionState, formData: FormData) {
  return runTransition(formData, "scheduled");
}
