"use server";

import { revalidatePath } from "next/cache";

import { type ApprovalDecision } from "@/domain";
import { getOperatorActor, requireOperator } from "@/lib/auth/operator";
import { decideNode } from "@/lib/knowledge-graph/persistence";
import { isSupabaseAdminConfigured } from "@/lib/supabase/server";

/**
 * The Brain trust gate: approve or reject a proposed knowledge node. Approving
 * moves it to `trusted` (usable in outbound copy); rejecting archives it. This
 * is the human gate the whole screen is built around — internal only, nothing
 * outbound. `persisted: false` is the honest offline signal so the review list
 * can drop the card without claiming a real decision was written.
 */
export type BrainDecisionResult = { ok: true; persisted: boolean } | { ok: false; error: string };

export async function decideBrainNode(nodeId: string, decision: ApprovalDecision): Promise<BrainDecisionResult> {
  await requireOperator();
  if (!nodeId) return { ok: false, error: "Missing node." };
  if (decision !== "approve" && decision !== "reject") return { ok: false, error: "Invalid decision." };

  if (!isSupabaseAdminConfigured()) return { ok: true, persisted: false };

  const actor = await getOperatorActor();
  const result = await decideNode(nodeId, decision, { actor });
  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath("/brain");
  return { ok: true, persisted: true };
}
