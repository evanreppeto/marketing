import { type SupabaseClient } from "@supabase/supabase-js";

import {
  type NativeTaskStatus,
  type NormalizedTask,
  type OperatorDropTarget,
  canOperatorMoveTask,
  normalizeAgentTask,
  redactDeep,
  redactSecrets,
} from "@/domain";
import { type AgentTaskDetail, getAgentTaskDetail } from "@/lib/agent-operations/read-model";
import { getSupabaseAdminClient } from "@/lib/supabase/server";

/**
 * Mark Operations API task layer. Reads normalize `agent_tasks` into the
 * agent-facing shape; writes are LIFECYCLE-ONLY (claim / log / complete /
 * block) and never touch approval status, decisions, or launch/dispatch locks.
 */

const TERMINAL_STATUSES = new Set(["completed", "failed", "canceled"]);

const TASK_SELECT = "*, agents(key, name)";

type AgentJoin = { key: string | null; name: string | null } | null;

type TaskRow = {
  id: string;
  agent_id: string;
  objective: string | null;
  status: string | null;
  priority: string | null;
  campaign_id: string | null;
  approval_item_id: string | null;
  source_type: string | null;
  source_id: string | null;
  started_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  metadata: Record<string, unknown> | null;
  agents?: AgentJoin;
};

export type ListAgentTasksFilter = {
  status?: NativeTaskStatus;
  assignee?: string;
  limit?: number;
};

export type TaskMutationResult =
  | { ok: true; task: NormalizedTask }
  | { ok: false; reason: "not_found" }
  | { ok: false; reason: "conflict"; currentStatus: string };

function clampLimit(limit: number | undefined, fallback: number): number {
  if (typeof limit !== "number" || !Number.isInteger(limit) || limit <= 0) return fallback;
  return Math.min(limit, 100);
}

function rowToNormalized(row: TaskRow, latestLogError: string | null = null): NormalizedTask {
  return normalizeAgentTask({
    id: row.id,
    objective: row.objective,
    status: row.status,
    priority: row.priority,
    campaignId: row.campaign_id,
    approvalItemId: row.approval_item_id,
    sourceType: row.source_type,
    sourceId: row.source_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    metadata: row.metadata,
    agentKey: row.agents?.key ?? null,
    agentName: row.agents?.name ?? null,
    latestLogError,
  });
}

async function readTaskRow(taskId: string, client: SupabaseClient): Promise<TaskRow | null> {
  const { data, error } = await client.from("agent_tasks").select(TASK_SELECT).eq("id", taskId).maybeSingle();
  if (error) {
    throw new Error(`agent_tasks read failed: ${error.message}`);
  }
  return (data as TaskRow | null) ?? null;
}

export async function listAgentTasks(
  filter: ListAgentTasksFilter = {},
  client: SupabaseClient = getSupabaseAdminClient(),
): Promise<NormalizedTask[]> {
  let agentId: string | undefined;
  if (filter.assignee) {
    const { data: agentRow, error: agentErr } = await client
      .from("agents")
      .select("id")
      .eq("key", filter.assignee)
      .maybeSingle();
    if (agentErr) {
      throw new Error(`listAgentTasks agent lookup failed: ${agentErr.message}`);
    }
    if (!agentRow) {
      // Unknown assignee -> no tasks rather than an unfiltered dump.
      return [];
    }
    agentId = (agentRow as { id: string }).id;
  }

  let query = client.from("agent_tasks").select(TASK_SELECT);
  if (filter.status) {
    query = query.eq("status", filter.status);
  }
  if (agentId) {
    query = query.eq("agent_id", agentId);
  }
  query = query.limit(clampLimit(filter.limit, 25));

  const { data, error } = await query.order("updated_at", { ascending: false });
  if (error) {
    throw new Error(`listAgentTasks failed: ${error.message}`);
  }

  const rows = (data ?? []) as TaskRow[];
  return rows.map((row) => rowToNormalized(row));
}

export type AgentTaskForApi = NormalizedTask & { detail: Extract<AgentTaskDetail, { status: "live" }> };

export type GetAgentTaskResult =
  | { ok: true; task: AgentTaskForApi }
  | { ok: false; reason: "not_found" }
  | { ok: false; reason: "unavailable"; message: string };

export async function getAgentTaskForApi(
  taskId: string,
  client?: SupabaseClient,
): Promise<GetAgentTaskResult> {
  const detail = await getAgentTaskDetail(taskId, client);
  if (detail.status === "not_found") {
    return { ok: false, reason: "not_found" };
  }
  if (detail.status === "unavailable") {
    return { ok: false, reason: "unavailable", message: detail.message };
  }

  const latestLogError = detail.logs.find((log) => log.errorMessage)?.errorMessage ?? null;
  const task = normalizeAgentTask({
    id: detail.task.id,
    objective: detail.task.objective,
    status: detail.task.status,
    priority: detail.task.priority,
    campaignId: detail.task.campaignId,
    approvalItemId: detail.task.approvalItemId,
    sourceType: detail.task.sourceType,
    sourceId: detail.task.sourceId,
    createdAt: detail.task.createdAt,
    updatedAt: detail.task.updatedAt,
    metadata: detail.task.metadata,
    agentKey: detail.agent.key,
    agentName: detail.agent.name,
    latestLogError,
  });

  return { ok: true, task: { ...task, detail } };
}

async function updateAndNormalize(
  taskId: string,
  patch: Record<string, unknown>,
  client: SupabaseClient,
): Promise<NormalizedTask> {
  const { data, error } = await client
    .from("agent_tasks")
    .update(patch)
    .eq("id", taskId)
    .select(TASK_SELECT)
    .single();
  if (error) {
    throw new Error(`agent_tasks update failed: ${error.message}`);
  }
  return rowToNormalized(data as TaskRow);
}

export async function claimAgentTask(
  taskId: string,
  client: SupabaseClient = getSupabaseAdminClient(),
): Promise<TaskMutationResult> {
  const row = await readTaskRow(taskId, client);
  if (!row) return { ok: false, reason: "not_found" };
  if (row.status !== "queued") {
    return { ok: false, reason: "conflict", currentStatus: row.status ?? "unknown" };
  }
  const task = await updateAndNormalize(
    taskId,
    { status: "running", started_at: new Date().toISOString() },
    client,
  );
  return { ok: true, task };
}

export async function completeAgentTask(
  taskId: string,
  opts: { summary?: string; metadata?: Record<string, unknown> } = {},
  client: SupabaseClient = getSupabaseAdminClient(),
): Promise<TaskMutationResult> {
  const row = await readTaskRow(taskId, client);
  if (!row) return { ok: false, reason: "not_found" };
  if (TERMINAL_STATUSES.has(row.status ?? "")) {
    return { ok: false, reason: "conflict", currentStatus: row.status ?? "unknown" };
  }
  const mergedMetadata: Record<string, unknown> = {
    ...(row.metadata ?? {}),
    ...(redactDeep(opts.metadata ?? {}) as Record<string, unknown>),
  };
  if (opts.summary) {
    mergedMetadata.completion_summary = redactSecrets(opts.summary);
  }
  const task = await updateAndNormalize(
    taskId,
    { status: "completed", completed_at: new Date().toISOString(), metadata: mergedMetadata },
    client,
  );
  return { ok: true, task };
}

export async function blockAgentTask(
  taskId: string,
  opts: { reason: string; metadata?: Record<string, unknown> },
  client: SupabaseClient = getSupabaseAdminClient(),
): Promise<TaskMutationResult> {
  const row = await readTaskRow(taskId, client);
  if (!row) return { ok: false, reason: "not_found" };
  if (TERMINAL_STATUSES.has(row.status ?? "")) {
    return { ok: false, reason: "conflict", currentStatus: row.status ?? "unknown" };
  }
  const reason = redactSecrets(opts.reason);
  const mergedMetadata: Record<string, unknown> = {
    ...(row.metadata ?? {}),
    ...(redactDeep(opts.metadata ?? {}) as Record<string, unknown>),
    blocked_reason: reason,
  };
  const task = await updateAndNormalize(taskId, { status: "blocked", metadata: mergedMetadata }, client);

  // Record the block on the run-log timeline (best-effort; the state change is
  // already persisted above). agent_id is NOT NULL on agent_run_logs.
  const { error: logError } = await client.from("agent_run_logs").insert({
    task_id: taskId,
    agent_id: row.agent_id,
    run_status: "failed",
    error_message: reason,
    reasoning_summary: "Mark blocked the task pending human input.",
  });
  if (logError) {
    throw new Error(`block run-log insert failed: ${logError.message}`);
  }

  return { ok: true, task };
}

const OPEN_APPROVAL_STATUSES = new Set([
  "needs_compliance",
  "needs_review",
  "pending_approval",
  "pending_owner_approval",
  "revision_requested",
]);

export type MoveTaskResult =
  | { ok: true; task: NormalizedTask }
  | { ok: false; reason: "not_found" }
  | { ok: false; reason: "rejected"; code: string };

async function hasOpenApproval(
  approvalItemId: string | null,
  client: SupabaseClient,
): Promise<boolean> {
  if (!approvalItemId) return false;
  const { data, error } = await client
    .from("approval_items")
    .select("status")
    .eq("id", approvalItemId)
    .maybeSingle();
  if (error) {
    throw new Error(`approval_items lookup failed: ${error.message}`);
  }
  const status = (data as { status: string | null } | null)?.status ?? null;
  return status !== null && OPEN_APPROVAL_STATUSES.has(status);
}

/**
 * Operator-driven board move (drag = immediate state change). Validates the
 * transition with the pure domain rule, applies status + timestamp updates,
 * and records an audit entry on the run-log timeline. Never touches approval
 * decisions or outbound locks.
 */
export async function moveAgentTask(
  taskId: string,
  toStatus: OperatorDropTarget,
  client: SupabaseClient = getSupabaseAdminClient(),
): Promise<MoveTaskResult> {
  const row = await readTaskRow(taskId, client);
  if (!row) return { ok: false, reason: "not_found" };

  const openApproval = await hasOpenApproval(row.approval_item_id, client);
  const check = canOperatorMoveTask(row.status ?? "queued", toStatus, { hasOpenApproval: openApproval });
  if (!check.ok) {
    return { ok: false, reason: "rejected", code: check.reason };
  }

  const patch: Record<string, unknown> = { status: toStatus };
  if (toStatus === "running" && !row.started_at) {
    patch.started_at = new Date().toISOString();
  }
  if (toStatus === "completed") {
    patch.completed_at = new Date().toISOString();
  }

  const task = await updateAndNormalize(taskId, patch, client);

  const { error: logError } = await client.from("agent_run_logs").insert({
    task_id: taskId,
    agent_id: row.agent_id,
    run_status: toStatus === "completed" ? "succeeded" : toStatus === "blocked" ? "failed" : "running",
    reasoning_summary: `Operator moved task to ${toStatus} from the board.`,
    metadata: { source: "operator_board_move", from_status: row.status, to_status: toStatus },
  });
  if (logError) {
    throw new Error(`move run-log insert failed: ${logError.message}`);
  }

  return { ok: true, task };
}

export type AppendRunLogInput = {
  message?: string;
  reasoningSummary?: string;
  runStatus?: string;
  modelProvider?: string;
  modelName?: string;
  metadata?: Record<string, unknown>;
};

export type AppendRunLogResult = { ok: true; logId: string } | { ok: false; reason: "not_found" };

/**
 * Append a run-log entry to a task. Inserts into `agent_run_logs` ONLY — never
 * mutates `agent_tasks` (logging does not change task lifecycle state).
 */
export async function appendAgentRunLog(
  taskId: string,
  input: AppendRunLogInput,
  client: SupabaseClient = getSupabaseAdminClient(),
): Promise<AppendRunLogResult> {
  const { data: taskRow, error: taskErr } = await client
    .from("agent_tasks")
    .select("agent_id")
    .eq("id", taskId)
    .maybeSingle();
  if (taskErr) {
    throw new Error(`appendAgentRunLog task lookup failed: ${taskErr.message}`);
  }
  if (!taskRow) {
    return { ok: false, reason: "not_found" };
  }

  const rawSummary = input.reasoningSummary ?? input.message ?? null;
  const reasoningSummary = rawSummary === null ? null : redactSecrets(rawSummary);
  const { data, error } = await client
    .from("agent_run_logs")
    .insert({
      task_id: taskId,
      agent_id: (taskRow as { agent_id: string }).agent_id,
      run_status: input.runStatus ?? "running",
      reasoning_summary: reasoningSummary,
      model_provider: input.modelProvider ?? null,
      model_name: input.modelName ?? null,
      metadata: redactDeep(input.metadata ?? {}) as Record<string, unknown>,
    })
    .select("id")
    .single();
  if (error) {
    throw new Error(`appendAgentRunLog insert failed: ${error.message}`);
  }
  return { ok: true, logId: (data as { id: string }).id };
}
