"use server";

import { revalidatePath } from "next/cache";

import { getCurrentAgentTaskTenantFields } from "@/lib/agent-tasks/scope";
import { getOperatorActor, requireOperator } from "@/lib/auth/operator";
import { transitionDispatch } from "@/lib/dispatch/persistence";
import { DISPATCH_STATUS_ORDER, type DispatchStatus } from "@/lib/dispatch/status";
import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/server";

/**
 * Operator-driven dispatch transitions from the Outbox — confirm a queued send,
 * mark a sent dispatch delivered, retry a failure, or cancel. These record real
 * `campaign_dispatches` state changes + a campaign event; the app never performs
 * the send itself (the outbound-locked posture — a human confirms every send).
 * Gated by requireOperator() and org-scoped. `persisted: false` is the honest
 * offline/demo signal.
 */
export type OutboxActionResult =
  | { ok: true; persisted: boolean; status?: DispatchStatus }
  | { ok: false; error: string };

const ALLOWED_TARGET: ReadonlySet<DispatchStatus> = new Set(DISPATCH_STATUS_ORDER);

export async function transitionDispatchAction(dispatchId: string, to: DispatchStatus): Promise<OutboxActionResult> {
  await requireOperator();

  if (!dispatchId) return { ok: false, error: "Missing dispatch." };
  if (!ALLOWED_TARGET.has(to)) return { ok: false, error: "Unknown dispatch status." };

  if (!isSupabaseAdminConfigured()) return { ok: true, persisted: false, status: to };

  try {
    const operator = await getOperatorActor();
    const tenant = await getCurrentAgentTaskTenantFields();
    await transitionDispatch({ dispatchId, to, operator, tenant }, getSupabaseAdminClient());
    revalidatePath("/outbox");
    return { ok: true, persisted: true, status: to };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not update the dispatch." };
  }
}
