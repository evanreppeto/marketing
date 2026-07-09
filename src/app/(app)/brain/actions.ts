"use server";

import { revalidatePath } from "next/cache";

import { type ApprovalDecision } from "@/domain";
import { getOperatorActor, requireOperator } from "@/lib/auth/operator";
import { getCurrentOrgId } from "@/lib/auth/org";
import {
  backfillMissingEmbeddings,
  resyncCampaignsIntoBrain,
  resyncCrmIntoBrain,
  resyncMediaIntoBrain,
} from "@/lib/brain-ingestion/sync";
import { probeEmbedding } from "@/lib/embeddings/gemini-embeddings";
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

export type RebuildBrainResult = { ok: boolean; synced: number; embedded: number; message: string };

/**
 * Operator-triggered Brain refresh: re-ingest CRM/campaigns/media into the graph,
 * then backfill semantic embeddings for any node missing one. The backfill is the
 * key part after setting GEMINI_API_KEY — it flips recall from keyword to semantic.
 * The result message tells the operator when embeddings were skipped (no key), so
 * the "why is recall keyword-only" state is self-explaining in the UI.
 */
export async function rebuildBrainMemoryAction(): Promise<RebuildBrainResult> {
  await requireOperator();
  if (!isSupabaseAdminConfigured()) {
    return { ok: false, synced: 0, embedded: 0, message: "Brain refresh needs a connected backend." };
  }
  try {
    const orgId = await getCurrentOrgId();
    const [crm, camp, media] = [
      await resyncCrmIntoBrain({ orgId }),
      await resyncCampaignsIntoBrain({ orgId }),
      await resyncMediaIntoBrain({ orgId }),
    ];
    const synced = crm.synced + camp.synced + media.synced;

    // Self-diagnosing probe: does embedding actually work in THIS runtime? This is
    // what flips recall from keyword-only to semantic. Surface the EXACT failure
    // (missing key, model not enabled for the key, quota, wrong dims) instead of a
    // guess, so the fix is obvious.
    const probe = await probeEmbedding();
    if (!probe.ok) {
      revalidatePath("/brain");
      return {
        ok: true,
        synced,
        embedded: 0,
        message: `Refreshed ${synced} records. Semantic recall is OFF — ${probe.error} (model "${probe.model}"; set GEMINI_EMBEDDING_MODEL to override).`,
      };
    }

    const embed = await backfillMissingEmbeddings({ orgId });
    revalidatePath("/brain");
    const base = `Refreshed ${synced} records`;
    return {
      ok: true,
      synced,
      embedded: embed.embedded,
      message:
        embed.embedded > 0
          ? embed.remaining
            ? `${base} · embedded ${embed.embedded} nodes. More remain — click Refresh again to finish.`
            : `${base} · embedded ${embed.embedded} nodes. Semantic recall is ON.`
          : `${base}. Semantic recall is ON — all nodes already embedded.`,
    };
  } catch (error) {
    return { ok: false, synced: 0, embedded: 0, message: error instanceof Error ? error.message : "Brain refresh failed." };
  }
}
