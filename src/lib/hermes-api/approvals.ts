import { type SupabaseClient } from "@supabase/supabase-js";

import { type ApprovalCard, listApprovalCards } from "@/lib/approvals/read-model";
import { getSupabaseAdminClient } from "@/lib/supabase/server";

/**
 * Mark Operations API approvals layer.
 *
 * SAFETY: Mark may READ approvals and ADD a recommendation, but never decides.
 * `addApprovalRecommendation` writes to `approval_recommendations` ONLY — it
 * does not touch `approval_items.status`, never inserts into the
 * `approval_decisions` ledger, and never calls the human decision path
 * (`@/lib/approvals/decisions`). Outbound stays locked behind the human gate.
 */

// Every approval_status enum value — used so getApprovalForApi can resolve an
// item regardless of where it sits in the workflow (not just active states).
const ALL_APPROVAL_STATUSES = [
  "draft",
  "needs_compliance",
  "pending_approval",
  "pending_owner_approval",
  "approved",
  "declined",
  "rejected",
  "revision_requested",
  "blocked",
  "needs_revision",
  "archived",
];

export async function listApprovalsForApi(
  filter: { statuses?: string[]; limit?: number } = {},
  client?: SupabaseClient,
): Promise<ApprovalCard[]> {
  return listApprovalCards(
    { statuses: filter.statuses, limit: filter.limit },
    client ?? getSupabaseAdminClient(),
  );
}

export async function getApprovalForApi(id: string, client?: SupabaseClient): Promise<ApprovalCard | null> {
  const cards = await listApprovalCards(
    { statuses: ALL_APPROVAL_STATUSES, limit: 500 },
    client ?? getSupabaseAdminClient(),
  );
  return cards.find((card) => card.id === id) ?? null;
}

export type AddRecommendationInput = {
  approvalItemId: string;
  agent?: string;
  recommendation: string;
  rationale?: string | null;
  riskFlags?: string[];
  suggestedEdits?: string | null;
  metadata?: Record<string, unknown>;
};

export type AddRecommendationResult =
  | { ok: true; recommendationId: string }
  | { ok: false; reason: "not_found" };

export async function addApprovalRecommendation(
  input: AddRecommendationInput,
  client: SupabaseClient = getSupabaseAdminClient(),
): Promise<AddRecommendationResult> {
  // Validate the target exists (read-only) so a bad id 404s instead of failing
  // an FK insert. This is the ONLY read of approval_items here.
  const { data: item, error: lookupError } = await client
    .from("approval_items")
    .select("id")
    .eq("id", input.approvalItemId)
    .maybeSingle();
  if (lookupError) {
    throw new Error(`approval lookup failed: ${lookupError.message}`);
  }
  if (!item) {
    return { ok: false, reason: "not_found" };
  }

  const { data, error } = await client
    .from("approval_recommendations")
    .insert({
      approval_item_id: input.approvalItemId,
      agent: input.agent ?? "mark",
      recommendation: input.recommendation,
      rationale: input.rationale ?? null,
      risk_flags: input.riskFlags ?? [],
      suggested_edits: input.suggestedEdits ?? null,
      metadata: input.metadata ?? {},
    })
    .select("id")
    .single();
  if (error) {
    throw new Error(`addApprovalRecommendation insert failed: ${error.message}`);
  }
  return { ok: true, recommendationId: (data as { id: string }).id };
}
