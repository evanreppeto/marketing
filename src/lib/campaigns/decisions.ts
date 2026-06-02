import { type SupabaseClient } from "@supabase/supabase-js";

import { getSupabaseAdminClient } from "../supabase/server";

export type ApprovalDecision = "approved" | "declined" | "archived";

export type DecideApprovalInput = {
  approvalItemId: string;
  decision: ApprovalDecision;
  operator: string;
  notes?: string;
};

/**
 * Record a human decision on a campaign approval item. A real backend state
 * transition: logs an approval_decision, moves the approval item + linked asset
 * + campaign to the decided status, and writes a campaign event.
 *
 * Outbound dispatch is NEVER unlocked here — approval marks the work ready for a
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
    const { error: campaignError } = await client.from("campaigns").update({ status: decision }).eq("id", item.campaign_id);
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

function assertOk(label: string, error: { message: string } | null) {
  if (error) {
    throw new Error(`${label} failed: ${error.message}`);
  }
}
