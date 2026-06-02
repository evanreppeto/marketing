export type StatusTone = "amber" | "green" | "red" | "gray" | "blue" | "dark";

export type MarkActivity = {
  name: string;
  status: string;
  killSwitch: string;
  lastHeartbeat: string | null;
  drafting: Array<{ title: string; taskType: string; updated: string }>;
  awaitingReview: number;
  recentOutputs: Array<{ title: string; status: string; time: string }>;
};

function titleize(value: string): string {
  return value
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function shortTime(iso: string | null, now: number): string {
  if (!iso) return "—";
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "—";
  const diffMs = now - then;
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function personaSignalLabel(total: number, recent: number): string {
  const noun = total === 1 ? "lead" : "leads";
  return recent > 0 ? `${total} ${noun} · ${recent} new` : `${total} ${noun}`;
}

type AgentRowLike = { name?: string | null; status?: string | null; metadata?: unknown } | null;
type TaskRowLike = { objective?: string | null; task_type?: string | null; status?: string | null; updated_at?: string | null };
type OutputRowLike = { title?: string | null; approval_status?: string | null; created_at?: string | null };

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export function toMarkActivity(
  agent: AgentRowLike,
  tasks: TaskRowLike[],
  outputs: OutputRowLike[],
  awaitingReview: number,
  now: number,
): MarkActivity {
  const metadata = asRecord(agent?.metadata);
  const heartbeatIso =
    (typeof metadata.last_heartbeat_at === "string" && metadata.last_heartbeat_at) ||
    (typeof metadata.runner_last_seen_at === "string" && metadata.runner_last_seen_at) ||
    null;
  const killSwitch = typeof metadata.kill_switch === "string" ? metadata.kill_switch : "Outbound locked";

  return {
    name: agent?.name ?? "Mark",
    status: agent?.status ? titleize(agent.status) : "Offline",
    killSwitch,
    lastHeartbeat: shortTime(heartbeatIso, now),
    drafting: tasks.map((t) => ({
      title: t.objective ?? "Agent task",
      taskType: titleize(t.task_type ?? "task"),
      updated: shortTime(t.updated_at ?? null, now),
    })),
    awaitingReview,
    recentOutputs: outputs.map((o) => ({
      title: o.title ?? "Agent output",
      status: titleize(o.approval_status ?? "draft"),
      time: shortTime(o.created_at ?? null, now),
    })),
  };
}
