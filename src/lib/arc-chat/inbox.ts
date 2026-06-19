import { type SupabaseClient } from "@supabase/supabase-js";

import { type ArcMention, parseMentions } from "@/domain";

import { getSupabaseAdminClient } from "../supabase/server";
import { failArcMessage, findPendingMessageByTask } from "./persistence";

/** How long a task may sit in `running` before a poll re-surfaces it for retry. */
const STALE_RUNNING_MS = 3 * 60_000;
/** Give up after this many reclaim attempts and fail the task + bubble. */
const MAX_CHAT_RETRIES = 3;

/**
 * The agent-facing side of Arc chat: the external Arc/Arc agent pulls
 * queued operator messages here (GET /api/v1/arc/messages), does its work,
 * then delivers a reply (POST /api/v1/arc/messages). Outbound stays locked.
 */

export type ChatInboxItem = {
  agentTaskId: string;
  conversationId: string;
  message: string;
  mentions: ArcMention[];
  operator: string;
  createdAt: string;
};

type TaskRow = {
  id: string;
  objective: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  retry_count?: number | null;
};

export type ArcChatTaskScope = { orgId: string; workspaceId: string };

function assertOk(label: string, error: { message: string } | null) {
  if (error) throw new Error(`${label} failed: ${error.message}`);
}

function applyScope<Query>(query: Query, scope?: ArcChatTaskScope): Query {
  if (!scope) return query;
  type EqQuery = { eq(column: string, value: string): EqQuery };
  return (query as unknown as EqQuery)
    .eq("org_id", scope.orgId)
    .eq("workspace_id", scope.workspaceId) as unknown as Query;
}

function toInboxItem(row: TaskRow): ChatInboxItem {
  const meta = (row.metadata ?? {}) as Record<string, unknown>;
  return {
    agentTaskId: row.id,
    conversationId: typeof meta.conversation_id === "string" ? meta.conversation_id : "",
    message: row.objective ?? (typeof meta.human_instruction === "string" ? meta.human_instruction : ""),
    mentions: parseMentions(meta.mentions),
    operator: typeof meta.requested_by === "string" ? meta.requested_by : "Operator",
    createdAt: row.created_at,
  };
}

/**
 * Queued chat messages awaiting a Arc reply. Lists only `queued` tasks — once a
 * task is claimed (queued -> running) by the webhook push or by a puller, it
 * drops out of this list, so a message is handed to Arc exactly once. This is
 * the fallback path; the primary wake is the ARC_WEBHOOK_URL push.
 */
export async function listQueuedChatTasks(
  limit = 20,
  client: SupabaseClient = getSupabaseAdminClient(),
  scope?: ArcChatTaskScope,
): Promise<ChatInboxItem[]> {
  const { data, error } = await applyScope(
    client
      .from("agent_tasks")
      .select("id, objective, metadata, created_at")
      .eq("task_type", "arc_chat_message")
      .eq("status", "queued"),
    scope,
  )
    .order("created_at", { ascending: true })
    .limit(limit);
  assertOk("agent_tasks inbox list", error);
  return ((data ?? []) as TaskRow[]).map(toInboxItem);
}

/**
 * Atomically claim a queued chat task for processing: queued -> running. The
 * `status = 'queued'` guard makes this a compare-and-set, so two workers (e.g. a
 * webhook push racing the inbox poll) can never both grab the same message —
 * only the first claim returns true. Stamps `started_at` for the task timeline.
 */
export async function claimChatTask(
  agentTaskId: string,
  client: SupabaseClient = getSupabaseAdminClient(),
  scope?: ArcChatTaskScope,
): Promise<boolean> {
  const { data, error } = await applyScope(
    client
      .from("agent_tasks")
      .update({ status: "running", started_at: new Date().toISOString() })
      .eq("id", agentTaskId)
      .eq("status", "queued"),
    scope,
  )
    .select("id")
    .maybeSingle<{ id: string }>();
  assertOk("agent_tasks claim", error);
  return Boolean(data);
}

/**
 * Reclaim chat tasks stuck in `running` past the stale cutoff (a wake/turn that
 * was claimed but never delivered a reply — e.g. the runner crashed mid-turn).
 *
 * Each stale task is either re-surfaced for another attempt (re-stamping
 * `started_at` and bumping `retry_count`, again a CAS so concurrent pollers
 * can't both grab it) or, once it's burned through `maxRetries`, given up on:
 * the task and its pending bubble are flipped to failed so the thread stops
 * hanging on "thinking". Returns the tasks handed back out for processing.
 */
export async function reclaimStaleChatTasks(
  opts: { staleMs?: number; maxRetries?: number; limit?: number; agentName?: string } = {},
  client: SupabaseClient = getSupabaseAdminClient(),
  scope?: ArcChatTaskScope,
): Promise<ChatInboxItem[]> {
  const staleMs = opts.staleMs ?? STALE_RUNNING_MS;
  const maxRetries = opts.maxRetries ?? MAX_CHAT_RETRIES;
  const limit = opts.limit ?? 20;
  const agentName = opts.agentName?.trim() || "Agent";
  const cutoff = new Date(Date.now() - staleMs).toISOString();

  const { data, error } = await applyScope(
    client
      .from("agent_tasks")
      .select("id, objective, metadata, created_at, retry_count")
      .eq("task_type", "arc_chat_message")
      .eq("status", "running")
      .lt("started_at", cutoff),
    scope,
  )
    .order("created_at", { ascending: true })
    .limit(limit);
  assertOk("agent_tasks stale list", error);

  const reclaimed: ChatInboxItem[] = [];
  for (const row of (data ?? []) as TaskRow[]) {
    const retries = row.retry_count ?? 0;

    if (retries >= maxRetries) {
      // Out of retries — fail the task and its pending bubble, best-effort.
      await settleChatTask(row.id, "failed", client, scope).catch(() => undefined);
      const pending = await findPendingMessageByTask(row.id, client).catch(() => null);
      if (pending) {
        await failArcMessage(
          { messageId: pending.id, body: `${agentName} didn't finish this reply in time. Please resend.` },
          client,
        ).catch(() => undefined);
      }
      continue;
    }

    const { data: claimed, error: claimError } = await applyScope(
      client
        .from("agent_tasks")
        .update({ started_at: new Date().toISOString(), retry_count: retries + 1 })
        .eq("id", row.id)
        .eq("status", "running")
        .lt("started_at", cutoff),
      scope,
    )
      .select("id")
      .maybeSingle<{ id: string }>();
    assertOk("agent_tasks reclaim", claimError);
    if (claimed) reclaimed.push(toInboxItem(row));
  }

  return reclaimed;
}

/** Move a chat task out of the queue once its reply has been delivered. */
export async function settleChatTask(
  agentTaskId: string,
  status: "completed" | "failed" = "completed",
  client: SupabaseClient = getSupabaseAdminClient(),
  scope?: ArcChatTaskScope,
): Promise<void> {
  const { error } = await applyScope(client.from("agent_tasks").update({ status }).eq("id", agentTaskId), scope);
  assertOk("agent_tasks settle", error);
}
