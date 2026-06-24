/**
 * Agent run-log status — mirrors the Postgres `agent_run_status` enum. Kept here
 * (pure) so the Arc task-log write path validates a free-string run_status at the
 * app layer and normalizes the model's plausible synonyms instead of failing as
 * a late Postgres enum 502. A type-level drift guard lives in the test.
 */
export const AGENT_RUN_STATUS_VALUES = ["queued", "running", "completed", "failed", "canceled"] as const;

export type AgentRunStatus = (typeof AGENT_RUN_STATUS_VALUES)[number];

const AGENT_RUN_STATUS_SET = new Set<string>(AGENT_RUN_STATUS_VALUES);

/** Synonyms a model plausibly emits, mapped to a real enum member. */
const AGENT_RUN_STATUS_ALIASES: Record<string, AgentRunStatus> = {
  in_progress: "running",
  inprogress: "running",
  started: "running",
  active: "running",
  done: "completed",
  complete: "completed",
  success: "completed",
  succeeded: "completed",
  error: "failed",
  errored: "failed",
  failure: "failed",
  cancelled: "canceled",
  cancel: "canceled",
  aborted: "canceled",
};

/** True only for an exact `agent_run_status` enum member. */
export function isAgentRunStatus(value: unknown): value is AgentRunStatus {
  return typeof value === "string" && AGENT_RUN_STATUS_SET.has(value);
}

/** Normalize a free-string run status to a valid enum value, or null if unresolved. */
export function normalizeAgentRunStatus(value: unknown): AgentRunStatus | null {
  if (typeof value !== "string") return null;
  const v = value.trim().toLowerCase();
  if (v.length === 0) return null;
  if (AGENT_RUN_STATUS_SET.has(v)) return v as AgentRunStatus;
  return AGENT_RUN_STATUS_ALIASES[v] ?? null;
}
