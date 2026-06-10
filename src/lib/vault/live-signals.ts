import { personaDisplay } from "@/app/_data/growth-engine";
import { OFFICIAL_PERSONA_MAPPINGS, type OfficialPersonaMapping } from "@/domain";

import { seedVaultNotes } from "./seed-notes";
import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "../supabase/server";

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

export type RecordSignal = {
  target: string;
  label: string;
  stat: string;
  tone: StatusTone;
  live: boolean;
};

type WikiLinkLike = { kind: string; target: string; label: string };

const PERSONA_KEYS = new Set<string>(OFFICIAL_PERSONA_MAPPINGS);

export async function getRecordSignals(links: WikiLinkLike[]): Promise<Map<string, RecordSignal>> {
  const signals = new Map<string, RecordSignal>();

  const personaTargets = [...new Set(links.filter((l) => l.kind === "persona" && PERSONA_KEYS.has(l.target)).map((l) => l.target))];

  if (!isSupabaseAdminConfigured()) {
    for (const target of personaTargets) {
      const label = personaDisplay[target as OfficialPersonaMapping]?.label ?? target;
      signals.set(target, { target, label, stat: "reference", tone: "amber", live: false });
    }
    return signals;
  }

  try {
    const supabase = getSupabaseAdminClient();
    const weekAgoIso = new Date(Date.now() - 7 * 86400000).toISOString();
    await Promise.all(
      personaTargets.map(async (target) => {
        const label = personaDisplay[target as OfficialPersonaMapping]?.label ?? target;
        const personaKey = target as OfficialPersonaMapping;
        const [totalResult, recentResult] = await Promise.all([
          supabase.from("leads").select("id", { count: "exact", head: true }).eq("persona", personaKey),
          supabase.from("leads").select("id", { count: "exact", head: true }).eq("persona", personaKey).gte("created_at", weekAgoIso),
        ]);
        const total = totalResult.count ?? 0;
        const recent = recentResult.count ?? 0;
        signals.set(target, { target, label, stat: personaSignalLabel(total, recent), tone: "amber", live: true });
      }),
    );
  } catch {
    // best-effort: leave persona links without chips rather than erroring the page
  }

  return signals;
}
