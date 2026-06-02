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

import { seedVaultNotes } from "./seed-notes";
import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "../supabase/server";

const NOT_CONFIGURED = "Supabase is not configured — Mark activity is offline. Showing static counts.";

export type VaultLiveSignals =
  | { status: "live"; activity: MarkActivity; generatedAt: string }
  | { status: "fallback"; activity: MarkActivity; message: string }
  | { status: "error"; activity: MarkActivity; message: string };

function seedReviewCount(): number {
  return seedVaultNotes.filter((n) => n.status === "Needs review").length;
}

function offlineActivity(now: number): MarkActivity {
  return toMarkActivity({ name: "Mark", status: "offline", metadata: {} }, [], [], seedReviewCount(), now);
}

export async function getVaultLiveSignals(): Promise<VaultLiveSignals> {
  const now = Date.now();
  if (!isSupabaseAdminConfigured()) {
    return { status: "fallback", activity: offlineActivity(now), message: NOT_CONFIGURED };
  }
  try {
    const supabase = getSupabaseAdminClient();
    const [agentResult, tasksResult, outputsResult, reviewResult] = await Promise.all([
      supabase.from("agents").select("name,status,metadata").eq("key", "mark").maybeSingle(),
      supabase
        .from("agent_tasks")
        .select("objective,task_type,status,updated_at")
        .in("status", ["queued", "running", "needs_approval"])
        .order("updated_at", { ascending: false })
        .limit(4),
      supabase
        .from("agent_outputs")
        .select("title,approval_status,created_at")
        .order("created_at", { ascending: false })
        .limit(4),
      supabase.from("vault_notes").select("slug", { count: "exact", head: true }).eq("status", "needs_review"),
    ]);

    const reviewCount = reviewResult.count ?? 0;
    const activity = toMarkActivity(
      agentResult.data ?? null,
      tasksResult.data ?? [],
      outputsResult.data ?? [],
      reviewCount,
      now,
    );
    return { status: "live", activity, generatedAt: new Date(now).toISOString() };
  } catch (error) {
    return {
      status: "error",
      activity: offlineActivity(now),
      message: error instanceof Error ? error.message : "Mark activity is unavailable.",
    };
  }
}
