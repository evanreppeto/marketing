import { type SupabaseClient } from "@supabase/supabase-js";

import { type OpportunityPackageBrief } from "@/domain";
import { getCurrentAgentTaskTenantFields } from "@/lib/agent-tasks/scope";
import { markAgentKeys } from "@/lib/arc-chat/agent-config";
import { notifyOpportunityScan } from "@/lib/arc-chat/notify";
import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/server";

export type EnqueueOpportunityTaskInput = {
  opportunityId: string;
  objective: string;
  operator: string;
  /** The draft campaign the run fills with a package. */
  campaignId: string;
  /** Deterministic brief the draft run turns into email/SMS/paid/landing copy. */
  brief: OpportunityPackageBrief;
};

/**
 * Queue an opportunity draft as an agent_task for Arc. Mirrors the agent
 * resolution used by arc-chat/enqueue.ts (markAgentKeys). Outbound stays locked.
 * The campaign id + brief ride in metadata so the draft executor (inline, or a
 * runner/worker later) has everything it needs to generate the package.
 * Returns the new task id, or throws if no Arc agent is registered yet.
 */
export async function enqueueArcOpportunityTask(
  input: EnqueueOpportunityTaskInput,
  client: SupabaseClient = getSupabaseAdminClient(),
): Promise<string> {
  const { data: agent } = await client
    .from("agents")
    .select("id")
    .in("key", await markAgentKeys())
    .limit(1)
    .maybeSingle<{ id: string }>();
  if (!agent) throw new Error("Arc agent not found");

  const tenant = await getCurrentAgentTaskTenantFields();

  const { data: task, error } = await client
    .from("agent_tasks")
    .insert({
      ...tenant,
      agent_id: agent.id,
      status: "queued",
      priority: "high",
      objective: input.objective,
      task_type: "arc_opportunity_draft",
      source_type: "opportunity",
      source_id: input.opportunityId,
      campaign_id: input.campaignId,
      metadata: {
        requested_by: input.operator,
        source: "opportunity_inbox",
        outbound_locked: true,
        campaign_id: input.campaignId,
        brief: input.brief,
      },
    })
    .select("id")
    .single<{ id: string }>();
  if (error || !task) throw new Error(error?.message ?? "failed to enqueue opportunity task");
  return task.id;
}

export const OPPORTUNITY_SCAN_BRIEFING =
  "Survey the current CRM, personas, brand knowledge, recent activity, and the existing opportunity inbox. " +
  "Propose source-backed opportunities the deterministic detectors miss — dormant companies worth re-engaging, " +
  "persona-segment gaps, competitor signals, or newly-approved media that suggests a campaign. For each, call " +
  "propose_opportunity with concrete evidence/source refs and a stable subject id. Everything stays pending for " +
  "human approval — do NOT draft campaigns, contact anyone, or take any outbound action.";

/**
 * Queue an operator-triggered opportunity scan as an agent_task for Arc. Arc surveys
 * the CRM / personas / brand / activity and proposes source-backed opportunities via
 * the propose_opportunity tool. Everything lands status=pending for operator approval.
 * Mirrors enqueueArcOpportunityTask but has no source_id (scan is not tied to one opportunity).
 */
export async function enqueueOpportunityScanTask(input: {
  operator: string;
}): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseAdminConfigured()) {
    return { ok: false, error: "Supabase is not configured." };
  }
  const client = getSupabaseAdminClient();

  try {
    const { data: agent } = await client
      .from("agents")
      .select("id")
      .in("key", await markAgentKeys())
      .limit(1)
      .maybeSingle<{ id: string }>();
    if (!agent) return { ok: false, error: "Arc agent not found." };

    const tenant = await getCurrentAgentTaskTenantFields();

    const { data: task, error } = await client
      .from("agent_tasks")
      .insert({
        ...tenant,
        agent_id: agent.id,
        status: "queued",
        priority: "high",
        objective: OPPORTUNITY_SCAN_BRIEFING,
        task_type: "arc_opportunity_scan",
        source_type: "operator_scan",
        metadata: { requested_by: input.operator, source: "opportunity_inbox", outbound_locked: true },
      })
      .select("id")
      .single<{ id: string }>();
    if (error || !task) {
      return { ok: false, error: error?.message ?? "Failed to enqueue opportunity scan task." };
    }

    await notifyOpportunityScan({
      agentTaskId: task.id,
      message: OPPORTUNITY_SCAN_BRIEFING,
      operator: input.operator,
    });

    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Unknown error." };
  }
}
