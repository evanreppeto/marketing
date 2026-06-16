/**
 * Status-transition logging for an operator's Arc chat message, from the moment
 * it's queued to the moment Arc's reply lands. This is the event-driven chat
 * lifecycle — no idle polling loop ever invokes the model.
 *
 *   queued        operator's message persisted + enqueued as an agent_task
 *   waking_mark   app is POSTing the wake to the Arc runner (ARC_RUNNER_URL)
 *   processing    Arc claimed the task (queued -> running) and is answering
 *   complete      Arc delivered a successful reply (POST /api/v1/arc/messages)
 *   failed        Arc reported a failure, or the task timed out / gave up
 *
 * The names `waking_mark` / `processing` are observability labels for this chat
 * path; the durable `agent_tasks.status` enum stores the equivalent
 * `queued -> running -> completed/failed`. We log the chat-facing names so the
 * lifecycle reads clearly without migrating the shared agent-task enum.
 */
export type ArcChatStatus = "queued" | "waking_mark" | "processing" | "complete" | "failed";

/**
 * Emit one structured line per chat status transition. Best-effort and synchronous —
 * logging must never throw into the send path or the callback handler.
 */
export function logArcChatStatus(
  status: ArcChatStatus,
  context: { agentTaskId: string; conversationId?: string; detail?: string },
): void {
  const parts = [`[arc-chat] ${status}`, `task=${context.agentTaskId}`];
  if (context.conversationId) parts.push(`conversation=${context.conversationId}`);
  if (context.detail) parts.push(context.detail);
  const line = parts.join(" ");
  if (status === "failed") {
    console.warn(line);
  } else {
    console.info(line);
  }
}
