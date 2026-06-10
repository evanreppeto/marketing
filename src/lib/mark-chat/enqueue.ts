import { type SupabaseClient } from "@supabase/supabase-js";

import { type MarkMention } from "@/domain";

import { getSupabaseAdminClient } from "../supabase/server";

export type EnqueueChatTaskInput = {
  conversationId: string;
  messageId: string;
  message: string;
  mentions: MarkMention[];
  operator: string;
  /** Model-routing hint for the external runner; routine chat defaults to "fast". */
  route?: "fast" | "standard";
  /** Operator stance for this message; the worker decides what Mark may do. */
  mode?: "ask" | "act" | "draft";
  /** Structured slash command id (e.g. "find-leads"), or null for plain chat. */
  command?: string | null;
};

function assertOk(label: string, error: { message: string } | null) {
  if (error) throw new Error(`${label} failed: ${error.message}`);
}

/**
 * Queue an operator chat message as an agent_task for Hermes. Mark's reply comes
 * back via POST /api/v1/hermes/messages. Outbound stays locked. Returns the new
 * task id, or throws if no Mark/Hermes agent is registered yet.
 */
export async function enqueueMarkChatTask(
  input: EnqueueChatTaskInput,
  client: SupabaseClient = getSupabaseAdminClient(),
): Promise<string> {
  const { data: agent, error: agentError } = await client
    .from("agents")
    .select("id")
    .in("key", ["mark", "hermes"])
    .limit(1)
    .maybeSingle<{ id: string }>();
  assertOk("agents lookup", agentError);

  if (!agent) {
    throw new Error("Mark isn't connected to this workspace yet, so the message can't be queued.");
  }

  const { data: task, error: taskError } = await client
    .from("agent_tasks")
    .insert({
      agent_id: agent.id,
      status: "queued",
      priority: "high",
      objective: input.message,
      task_type: "mark_chat_message",
      source_type: "mark_conversation",
      source_id: input.conversationId,
      metadata: {
        requested_by: input.operator,
        human_instruction: input.message,
        conversation_id: input.conversationId,
        message_id: input.messageId,
        mentions: input.mentions,
        command: input.command ?? null,
        source: "mark_chat",
        model_route: input.route ?? "fast",
        mode: input.mode ?? "act",
        outbound_locked: true,
      },
    })
    .select("id")
    .single<{ id: string }>();
  assertOk("agent_tasks insert", taskError);
  if (!task) throw new Error("agent_tasks insert returned no id");

  const { error: inputError } = await client.from("agent_task_inputs").insert({
    task_id: task.id,
    input_type: "operator_message",
    source_table: "mark_conversations",
    source_id: input.conversationId,
    summary: input.message,
    payload: { message: input.message, requested_by: input.operator, mentions: input.mentions, command: input.command ?? null },
  });
  assertOk("agent_task_inputs insert", inputError);

  return task.id;
}
