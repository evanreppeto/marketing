/**
 * Status-transition logging for an operator's Mark chat message, from the moment
 * it's queued to the moment Mark's reply lands. This is the event-driven chat
 * lifecycle — no idle polling loop ever invokes the model.
 *
 *   queued        operator's message persisted + enqueued as an agent_task
 *   waking_mark   app is POSTing the wake to the Mark runner (MARK_RUNNER_URL)
 *   processing    Mark claimed the task (queued -> running) and is answering
 *   complete      Mark delivered a successful reply (POST /api/v1/hermes/messages)
 *   failed        Mark reported a failure, or the task timed out / gave up
 *
 * The names `waking_mark` / `processing` are observability labels for this chat
 * path; the durable `agent_tasks.status` enum stores the equivalent
 * `queued -> running -> completed/failed`. We log the chat-facing names so the
 * lifecycle reads clearly without migrating the shared agent-task enum.
 */
export type MarkChatStatus = "queued" | "waking_mark" | "processing" | "complete" | "failed";

/**
 * Emit one structured line per chat status transition. Best-effort and synchronous —
 * logging must never throw into the send path or the callback handler.
 */
export function logMarkChatStatus(
  status: MarkChatStatus,
  context: { agentTaskId: string; conversationId?: string; detail?: string },
): void {
  const parts = [`[mark-chat] ${status}`, `task=${context.agentTaskId}`];
  if (context.conversationId) parts.push(`conversation=${context.conversationId}`);
  if (context.detail) parts.push(context.detail);
  const line = parts.join(" ");
  if (status === "failed") {
    console.warn(line);
  } else {
    console.info(line);
  }
}
