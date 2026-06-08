import { type SupabaseClient } from "@supabase/supabase-js";

import { type MarkMention, parseMentions } from "@/domain";

import { getSupabaseAdminClient } from "../supabase/server";

/**
 * The agent-facing side of Mark chat: the external Hermes/Mark agent pulls
 * queued operator messages here (GET /api/v1/hermes/messages), does its work,
 * then delivers a reply (POST /api/v1/hermes/messages). Outbound stays locked.
 */

export type ChatInboxItem = {
  agentTaskId: string;
  conversationId: string;
  message: string;
  mentions: MarkMention[];
  operator: string;
  createdAt: string;
};

type TaskRow = {
  id: string;
  objective: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

function assertOk(label: string, error: { message: string } | null) {
  if (error) throw new Error(`${label} failed: ${error.message}`);
}

/**
 * Queued chat messages awaiting a Mark reply. Read-only and idempotent: a task
 * stays here until a reply is delivered (which marks it completed), so the agent
 * can poll safely without claiming/locking.
 */
export async function listQueuedChatTasks(
  limit = 20,
  client: SupabaseClient = getSupabaseAdminClient(),
): Promise<ChatInboxItem[]> {
  const { data, error } = await client
    .from("agent_tasks")
    .select("id, objective, metadata, created_at")
    .eq("task_type", "mark_chat_message")
    .eq("status", "queued")
    .order("created_at", { ascending: true })
    .limit(limit);
  assertOk("agent_tasks inbox list", error);
  return ((data ?? []) as TaskRow[]).map((row) => {
    const meta = (row.metadata ?? {}) as Record<string, unknown>;
    return {
      agentTaskId: row.id,
      conversationId: typeof meta.conversation_id === "string" ? meta.conversation_id : "",
      message: row.objective ?? (typeof meta.human_instruction === "string" ? meta.human_instruction : ""),
      mentions: parseMentions(meta.mentions),
      operator: typeof meta.requested_by === "string" ? meta.requested_by : "Operator",
      createdAt: row.created_at,
    };
  });
}

/** Move a chat task out of the queue once its reply has been delivered. */
export async function settleChatTask(
  agentTaskId: string,
  status: "completed" | "failed" = "completed",
  client: SupabaseClient = getSupabaseAdminClient(),
): Promise<void> {
  const { error } = await client.from("agent_tasks").update({ status }).eq("id", agentTaskId);
  assertOk("agent_tasks settle", error);
}
