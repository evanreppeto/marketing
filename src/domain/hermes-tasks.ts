/**
 * Pure normalization for the Mark Operations API task surface.
 *
 * The DB stores agent work in `agent_tasks` with the native enum
 * `agent_task_status` (queued | running | blocked | needs_approval | completed
 * | failed | canceled) and no "assignee" column (it links to an agent via
 * `agent_id`). The agent-facing API exposes a normalized task object with the
 * spec vocabulary (pending / in_progress / …) plus a derived `assignee`,
 * `related_*`, `next_allowed_actions`, and a hardcoded `outbound_locked: true`.
 *
 * This module is I/O-free so it can be unit-tested in isolation.
 */

export const NATIVE_TASK_STATUSES = [
  "queued",
  "running",
  "blocked",
  "needs_approval",
  "completed",
  "failed",
  "canceled",
] as const;
export type NativeTaskStatus = (typeof NATIVE_TASK_STATUSES)[number];

export type SpecTaskStatus =
  | "pending"
  | "in_progress"
  | "blocked"
  | "needs_approval"
  | "completed"
  | "failed"
  | "canceled";

/** Spec status word -> native enum value, for parsing inbound `?status=` filters. */
const SPEC_TO_NATIVE: Record<string, NativeTaskStatus> = {
  pending: "queued",
  in_progress: "running",
};

/** Native enum value -> spec status word for output. */
export function statusToSpec(native: string): SpecTaskStatus {
  switch (native) {
    case "queued":
      return "pending";
    case "running":
      return "in_progress";
    default:
      return native as SpecTaskStatus;
  }
}

export function isNativeTaskStatus(value: string): value is NativeTaskStatus {
  return (NATIVE_TASK_STATUSES as readonly string[]).includes(value);
}

/**
 * Resolve a `?status=` query value (spec word OR native enum) to the native
 * enum value used in the DB. Returns null when the value is not recognized so
 * the caller can reject it with a 400.
 */
export function resolveStatusFilter(value: string): NativeTaskStatus | null {
  const normalized = value.trim().toLowerCase();
  if (normalized in SPEC_TO_NATIVE) {
    return SPEC_TO_NATIVE[normalized];
  }
  return isNativeTaskStatus(normalized) ? normalized : null;
}

/**
 * The lifecycle actions Mark may take next, given the task's native status.
 * Outbound actions (approve / launch / send / dispatch) are deliberately never
 * present — those stay behind the human approval gate.
 */
export function nextAllowedActions(nativeStatus: string): string[] {
  switch (nativeStatus) {
    case "queued":
      return ["claim"];
    case "running":
      return ["log", "complete", "block"];
    case "blocked":
      return ["log", "complete"];
    case "needs_approval":
      return ["log"];
    default:
      // completed | failed | canceled (terminal) or unknown -> nothing
      return [];
  }
}

export type NormalizedTask = {
  id: string;
  title: string;
  description: string;
  status: SpecTaskStatus;
  raw_status: string;
  assignee: string;
  blocked_reason: string | null;
  created_at: string | null;
  updated_at: string | null;
  related_type: string;
  related_id: string | null;
  priority: string;
  next_allowed_actions: string[];
  outbound_locked: true;
};

export type NormalizeTaskInput = {
  id: string;
  objective: string | null;
  status: string | null;
  priority: string | null;
  campaignId: string | null;
  approvalItemId: string | null;
  sourceType: string | null;
  sourceId: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  metadata: Record<string, unknown> | null;
  agentKey?: string | null;
  agentName?: string | null;
  /** error_message from the most recent run log, used as a blocked_reason fallback. */
  latestLogError?: string | null;
};

function stringField(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function deriveAssignee(input: NormalizeTaskInput): string {
  if (input.agentKey === "mark") return "mark";
  return input.agentName ?? input.agentKey ?? "unassigned";
}

function deriveRelated(input: NormalizeTaskInput): { related_type: string; related_id: string | null } {
  if (input.campaignId) return { related_type: "campaign", related_id: input.campaignId };
  if (input.approvalItemId) return { related_type: "approval", related_id: input.approvalItemId };
  if (input.sourceType) return { related_type: input.sourceType, related_id: input.sourceId ?? null };
  return { related_type: "other", related_id: null };
}

export function normalizeAgentTask(input: NormalizeTaskInput): NormalizedTask {
  const metadata = input.metadata ?? {};
  const rawStatus = input.status ?? "queued";
  const related = deriveRelated(input);

  return {
    id: input.id,
    title: input.objective ?? "(untitled task)",
    description: stringField(metadata.description) ?? input.objective ?? "",
    status: statusToSpec(rawStatus),
    raw_status: rawStatus,
    assignee: deriveAssignee(input),
    blocked_reason: stringField(metadata.blocked_reason) ?? input.latestLogError ?? null,
    created_at: input.createdAt,
    updated_at: input.updatedAt,
    related_type: related.related_type,
    related_id: related.related_id,
    priority: input.priority ?? "medium",
    next_allowed_actions: nextAllowedActions(rawStatus),
    outbound_locked: true,
  };
}

/** Columns an operator can drop a card into (Closed tray = canceled). */
export const OPERATOR_DROP_TARGETS = [
  "queued",
  "running",
  "blocked",
  "needs_approval",
  "completed",
  "canceled",
] as const;
export type OperatorDropTarget = (typeof OPERATOR_DROP_TARGETS)[number];

const OPERATOR_TERMINAL = new Set(["completed", "failed", "canceled"]);

export type MoveCheckResult =
  | { ok: true }
  | {
      ok: false;
      reason: "terminal" | "no_change" | "invalid_target" | "open_approval" | "approval_gate";
    };

/**
 * Decide whether an operator drag from `from` to `to` is allowed. Pure: the
 * caller supplies `hasOpenApproval` (whether the task's linked approval item is
 * still open). Guardrails: terminal tasks are immovable; a task with an open
 * approval cannot be completed; a needs_approval task can never be dragged
 * straight to completed (approval happens in /approvals, not the board).
 */
export function canOperatorMoveTask(
  from: string,
  to: string,
  opts: { hasOpenApproval: boolean },
): MoveCheckResult {
  if (!(OPERATOR_DROP_TARGETS as readonly string[]).includes(to)) {
    return { ok: false, reason: "invalid_target" };
  }
  if (from === to) {
    return { ok: false, reason: "no_change" };
  }
  if (OPERATOR_TERMINAL.has(from)) {
    return { ok: false, reason: "terminal" };
  }
  if (from === "needs_approval" && to === "completed") {
    return { ok: false, reason: "approval_gate" };
  }
  if (to === "completed" && opts.hasOpenApproval) {
    return { ok: false, reason: "open_approval" };
  }
  return { ok: true };
}
