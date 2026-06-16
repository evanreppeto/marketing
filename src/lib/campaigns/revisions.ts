import { type SupabaseClient } from "@supabase/supabase-js";

import { getSupabaseAdminClient } from "../supabase/server";

export type RevisionRequestInput = {
  campaignId: string;
  assetId: string;
  /** Pre-validated via validateRevisionInstruction. */
  instruction: string;
  operator: string;
};

export type RevisionRequestResult = {
  approvalItemId: string | null;
  agentTaskId: string | null;
};

/**
 * Record an operator's request for Arc to revise a specific campaign asset.
 *
 * This is a real backend state transition, not a send: it logs an approval
 * decision (revision_requested), flips the asset + approval item to
 * revision_requested, writes a campaign event, and queues a task for Arc.
 * Outbound dispatch is never unlocked here; `dispatch_locked` is left intact.
 */
export async function requestAssetRevision(
  input: RevisionRequestInput,
  client: SupabaseClient = getSupabaseAdminClient(),
): Promise<RevisionRequestResult> {
  const { campaignId, assetId, instruction, operator } = input;
  const now = new Date().toISOString();

  // 1. Find the asset's most recent approval item (if any).
  const { data: approvalRow, error: approvalError } = await client
    .from("approval_items")
    .select("id,status")
    .eq("campaign_asset_id", assetId)
    .order("submitted_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ id: string; status: string }>();
  assertOk("approval_items lookup", approvalError);

  const approvalItemId = approvalRow?.id ?? null;

  // 2 + 3. Log the decision and move the approval item to revision_requested.
  if (approvalRow) {
    const { error: decisionError } = await client.from("approval_decisions").insert({
      approval_item_id: approvalRow.id,
      decision: "revision_requested",
      decided_by: operator,
      decision_notes: instruction,
      previous_status: approvalRow.status,
      next_status: "revision_requested",
      metadata: { source: "campaigns_inline_prompt", outbound_locked: true },
    });
    assertOk("approval_decisions insert", decisionError);

    const { error: updateApprovalError } = await client
      .from("approval_items")
      .update({
        status: "revision_requested",
        decision_notes: instruction,
        reviewed_by: operator,
        reviewed_at: now,
      })
      .eq("id", approvalRow.id);
    assertOk("approval_items update", updateApprovalError);
  }

  // 4. Flip the asset. Note: dispatch_locked is deliberately untouched.
  const { error: assetError } = await client
    .from("campaign_assets")
    .update({ status: "revision_requested" })
    .eq("id", assetId);
  assertOk("campaign_assets update", assetError);

  // 5. Campaign event for the timeline.
  const { error: eventError } = await client.from("campaign_events").insert({
    campaign_id: campaignId,
    campaign_asset_id: assetId,
    approval_item_id: approvalItemId,
    event_type: "approval_decided",
    actor: operator,
    detail: `Revision requested: ${instruction}`,
    payload: { decision: "revision_requested", instruction, outbound_locked: true },
  });
  assertOk("campaign_events insert", eventError);

  // 6. Queue Arc to act on the revision.
  const agentTaskId = await queueArcRevision(client, { campaignId, assetId, approvalItemId, instruction, operator });

  return { approvalItemId, agentTaskId };
}

async function queueArcRevision(
  client: SupabaseClient,
  input: { campaignId: string; assetId: string; approvalItemId: string | null; instruction: string; operator: string },
): Promise<string | null> {
  const { data: agent, error: agentError } = await client
    .from("agents")
    .select("id")
    .eq("key", "arc")
    .limit(1)
    .maybeSingle<{ id: string }>();
  assertOk("agents lookup", agentError);

  // No Arc agent registered yet (campaign predates an orchestrator run): the
  // approval/asset state transition above still stands; just skip the queue.
  if (!agent) return null;

  const { data: task, error: taskError } = await client
    .from("agent_tasks")
    .insert({
      agent_id: agent.id,
      status: "queued",
      priority: "high",
      objective: input.instruction,
      task_type: "campaign_asset_revision",
      source_type: "campaign_asset",
      source_id: input.assetId,
      campaign_id: input.campaignId,
      approval_item_id: input.approvalItemId,
      metadata: {
        requested_by: input.operator,
        human_instruction: input.instruction,
        outbound_locked: true,
      },
    })
    .select("id")
    .single<{ id: string }>();
  assertOk("agent_tasks insert", taskError);
  if (!task) {
    throw new Error("agent_tasks insert returned no id");
  }

  const { error: inputError } = await client.from("agent_task_inputs").insert({
    task_id: task.id,
    input_type: "revision_instruction",
    source_table: "campaign_assets",
    source_id: input.assetId,
    summary: input.instruction,
    payload: { instruction: input.instruction, requested_by: input.operator },
  });
  assertOk("agent_task_inputs insert", inputError);

  return task.id;
}

function assertOk(label: string, error: { message: string } | null) {
  if (error) {
    throw new Error(`${label} failed: ${error.message}`);
  }
}
