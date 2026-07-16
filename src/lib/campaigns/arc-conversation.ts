import { type SupabaseClient } from "@supabase/supabase-js";

import { getCurrentAgentTaskTenantFields } from "@/lib/agent-tasks/scope";
import { getSupabaseAdminClient } from "../supabase/server";

export type ArcDirectiveInput = {
  campaignId: string;
  /** Pre-validated, non-empty operator message. */
  message: string;
  operator: string;
  /** Operator-configured agent display name, for user-facing error copy. */
  agentName?: string;
};

export type ArcDirectiveResult = {
  agentTaskId: string | null;
};

/**
 * Record an operator's message to Arc for a campaign. A durable directive, not
 * a live chat: it queues an agent_task (the same mechanism the revision flow
 * uses) plus its input, so Arc can pick it up and Arc's replies flow back as
 * agent_outputs. Never sends anything; outbound stays locked.
 */
export async function sendArcDirective(
  input: ArcDirectiveInput,
  client: SupabaseClient = getSupabaseAdminClient(),
): Promise<ArcDirectiveResult> {
  const { campaignId, message, operator, agentName = "Arc" } = input;

  // Hoisted above the agents lookup: `key` is only unique per-org, so the
  // lookup needs the tenant to avoid returning another tenant's Arc agent and
  // stamping its id onto this tenant's agent_tasks.agent_id.
  const tenant = await getCurrentAgentTaskTenantFields();

  const { data: agent, error: agentError } = await client
    .from("agents")
    .select("id")
    .eq("org_id", tenant.org_id)
    .eq("key", "arc")
    .limit(1)
    .maybeSingle<{ id: string }>();
  assertOk("agents lookup", agentError);

  // No Arc agent registered yet (campaign predates an orchestrator run). We
  // can't queue work, so surface that instead of silently dropping the message.
  if (!agent) {
    throw new Error(`${agentName} isn't connected to this workspace yet, so the message can't be queued.`);
  }

  const { data: task, error: taskError } = await client
    .from("agent_tasks")
    .insert({
      ...tenant,
      agent_id: agent.id,
      status: "queued",
      priority: "high",
      objective: message,
      task_type: "campaign_directive",
      source_type: "campaign",
      source_id: campaignId,
      campaign_id: campaignId,
      metadata: {
        requested_by: operator,
        human_instruction: message,
        source: "arc_conversation",
        outbound_locked: true,
      },
    })
    .select("id")
    .single<{ id: string }>();
  assertOk("agent_tasks insert", taskError);
  if (!task) {
    throw new Error("agent_tasks insert returned no id");
  }

  // org_id only — agent_task_inputs has no workspace_id column, so `...tenant`
  // would send one that doesn't exist.
  const { error: inputError } = await client.from("agent_task_inputs").insert({
    org_id: tenant.org_id,
    task_id: task.id,
    input_type: "operator_message",
    source_table: "campaigns",
    source_id: campaignId,
    summary: message,
    payload: { message, requested_by: operator },
  });
  assertOk("agent_task_inputs insert", inputError);

  return { agentTaskId: task.id };
}

function assertOk(label: string, error: { message: string } | null) {
  if (error) {
    throw new Error(`${label} failed: ${error.message}`);
  }
}
