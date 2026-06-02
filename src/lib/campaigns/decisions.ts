import { type SupabaseClient } from "@supabase/supabase-js";

import { getSupabaseAdminClient } from "../supabase/server";

export type ApprovalDecision = "approved" | "declined" | "archived";

export type DecideApprovalInput = {
  approvalItemId: string;
  decision: ApprovalDecision;
  operator: string;
  notes?: string;
};

const VALID_CAMPAIGN_STATUSES = new Set([
  "draft", "briefing", "generating", "pending_approval", "approved", "active", "paused", "archived", "blocked",
]);

/** Map an approval decision to a valid campaign_status. Declined work becomes unavailable (blocked). */
function decisionToCampaignStatus(decision: ApprovalDecision): string {
  if (decision === "approved") return "approved";
  if (decision === "archived") return "archived";
  return "blocked"; // declined
}

/** Coerce an arbitrary approval_status into a valid campaign_status, defaulting to pending_approval. */
function toCampaignStatus(status: string): string {
  return VALID_CAMPAIGN_STATUSES.has(status) ? status : "pending_approval";
}

/**
 * Record a human decision on a campaign approval item. A real backend state
 * transition: logs an approval_decision, moves the approval item + linked asset
 * + campaign to the decided status, and writes a campaign event.
 *
 * Outbound dispatch is NEVER unlocked here; approval marks the work ready for a
 * human-gated next step; it does not send anything (`dispatch_locked` /
 * `launch_locked` are left intact).
 */
export async function decideApprovalItem(
  input: DecideApprovalInput,
  client: SupabaseClient = getSupabaseAdminClient(),
) {
  const { approvalItemId, decision, operator, notes } = input;
  const now = new Date().toISOString();

  const { data: item, error: itemError } = await client
    .from("approval_items")
    .select("id,status,campaign_id,campaign_asset_id")
    .eq("id", approvalItemId)
    .maybeSingle<{ id: string; status: string; campaign_id: string | null; campaign_asset_id: string | null }>();
  assertOk("approval_items lookup", itemError);
  if (!item) {
    throw new Error("Approval item not found.");
  }

  const { error: decisionError } = await client.from("approval_decisions").insert({
    approval_item_id: item.id,
    decision,
    decided_by: operator,
    decision_notes: notes ?? null,
    previous_status: item.status,
    next_status: decision,
    metadata: { source: "campaigns_workspace", outbound_locked: true },
  });
  assertOk("approval_decisions insert", decisionError);

  const { error: updateItemError } = await client
    .from("approval_items")
    .update({ status: decision, reviewed_by: operator, reviewed_at: now, decision_notes: notes ?? null })
    .eq("id", item.id);
  assertOk("approval_items update", updateItemError);

  if (item.campaign_asset_id) {
    const assetUpdate: Record<string, unknown> = { status: decision };
    if (decision === "approved") {
      assetUpdate.approved_by = operator;
      assetUpdate.approved_at = now;
    }
    const { error: assetError } = await client.from("campaign_assets").update(assetUpdate).eq("id", item.campaign_asset_id);
    assertOk("campaign_assets update", assetError);
  }

  if (item.campaign_id) {
    const { error: campaignError } = await client.from("campaigns").update({ status: decisionToCampaignStatus(decision) }).eq("id", item.campaign_id);
    assertOk("campaigns update", campaignError);

    const { error: eventError } = await client.from("campaign_events").insert({
      campaign_id: item.campaign_id,
      campaign_asset_id: item.campaign_asset_id,
      approval_item_id: item.id,
      event_type: decision === "archived" ? "archived" : "approval_decided",
      actor: operator,
      detail: `Campaign ${decision} by ${operator}${notes ? `: ${notes}` : ""}`,
      payload: { decision, outbound_locked: true },
    });
    assertOk("campaign_events insert", eventError);
  }

  return { approvalItemId: item.id, decision, status: decision };
}

export type UndoDecisionInput = {
  approvalItemId: string;
  operator: string;
};

/**
 * Append-only reversal of the most recent decision on an approval item. Restores
 * the item (and any linked asset/campaign) to the decision's previous_status and
 * records a `reverted` approval_decisions row. Never deletes history; never
 * unlocks outbound. Throws if there is nothing to undo or the last decision was
 * already a reversal.
 */
export async function undoDecision(
  input: UndoDecisionInput,
  client: SupabaseClient = getSupabaseAdminClient(),
) {
  const { approvalItemId, operator } = input;

  const { data: last, error: lastError } = await client
    .from("approval_decisions")
    .select("id,decision,previous_status,next_status")
    .eq("approval_item_id", approvalItemId)
    .order("decided_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ id: string; decision: string; previous_status: string | null; next_status: string }>();
  assertOk("approval_decisions lookup", lastError);
  if (!last) {
    throw new Error("No decision to undo for this approval item.");
  }
  if (last.decision === "reverted") {
    throw new Error("The last action was already an undo; nothing to revert.");
  }

  const restoredStatus = last.previous_status ?? "pending_approval";

  const { data: item, error: itemError } = await client
    .from("approval_items")
    .select("id,status,campaign_id,campaign_asset_id")
    .eq("id", approvalItemId)
    .maybeSingle<{ id: string; status: string; campaign_id: string | null; campaign_asset_id: string | null }>();
  assertOk("approval_items lookup", itemError);
  if (!item) {
    throw new Error("Approval item not found.");
  }

  const { error: decisionError } = await client.from("approval_decisions").insert({
    approval_item_id: approvalItemId,
    decision: "reverted",
    decided_by: operator,
    previous_status: last.next_status,
    next_status: restoredStatus,
    metadata: { source: "approval_inbox_undo", reverted_decision_id: last.id, outbound_locked: true },
  });
  assertOk("approval_decisions insert (revert)", decisionError);

  const { error: updateItemError } = await client
    .from("approval_items")
    .update({ status: restoredStatus, reviewed_by: null, reviewed_at: null })
    .eq("id", approvalItemId);
  assertOk("approval_items update (revert)", updateItemError);

  if (item.campaign_asset_id) {
    const { error: assetError } = await client
      .from("campaign_assets")
      .update({ status: restoredStatus, approved_by: null, approved_at: null })
      .eq("id", item.campaign_asset_id);
    assertOk("campaign_assets update (revert)", assetError);
  }

  if (item.campaign_id) {
    const { error: campaignError } = await client.from("campaigns").update({ status: toCampaignStatus(restoredStatus) }).eq("id", item.campaign_id);
    assertOk("campaigns update (revert)", campaignError);

    const { error: eventError } = await client.from("campaign_events").insert({
      campaign_id: item.campaign_id,
      campaign_asset_id: item.campaign_asset_id,
      approval_item_id: approvalItemId,
      event_type: "decision_reverted",
      actor: operator,
      detail: `Decision undone by ${operator}; restored to ${restoredStatus}.`,
      payload: { reverted_decision_id: last.id, outbound_locked: true },
    });
    assertOk("campaign_events insert (revert)", eventError);
  }

  return { approvalItemId, restoredStatus };
}

function assertOk(label: string, error: { message: string } | null) {
  if (error) {
    throw new Error(`${label} failed: ${error.message}`);
  }
}
