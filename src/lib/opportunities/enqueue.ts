import { type SupabaseClient } from "@supabase/supabase-js";

import { markAgentKeys } from "@/lib/arc-chat/agent-config";
import { getSupabaseAdminClient } from "@/lib/supabase/server";

export type EnqueueOpportunityTaskInput = { opportunityId: string; objective: string; operator: string };

/**
 * Queue an opportunity draft as an agent_task for Arc. Mirrors the agent
 * resolution used by arc-chat/enqueue.ts (markAgentKeys). Outbound stays locked.
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

  const { data: task, error } = await client
    .from("agent_tasks")
    .insert({
      agent_id: agent.id,
      status: "queued",
      priority: "high",
      objective: input.objective,
      task_type: "arc_opportunity_draft",
      source_type: "opportunity",
      source_id: input.opportunityId,
      metadata: { requested_by: input.operator, source: "opportunity_inbox", outbound_locked: true },
    })
    .select("id")
    .single<{ id: string }>();
  if (error || !task) throw new Error(error?.message ?? "failed to enqueue opportunity task");
  return task.id;
}
