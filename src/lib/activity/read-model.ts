import { type SupabaseClient } from "@supabase/supabase-js";

import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "../supabase/server";

/**
 * Unified activity log. The control plane already WRITES a full audit trail
 * (human approval decisions, agent run logs, generated drafts, campaign
 * lifecycle events) but, before this, never read it back. This read-model
 * merges those four real tables into one chronological feed.
 */
export type ActivityKind = "decision" | "run" | "draft" | "campaign";
export type ActivityTone = "green" | "red" | "amber" | "blue" | "gray";

export type ActivityEntry = {
  id: string;
  kind: ActivityKind;
  tone: ActivityTone;
  title: string;
  detail: string;
  actor: string;
  occurredAt: string; // ISO timestamp
  href: string | null;
};

export type RecentActivity =
  | { status: "live"; entries: ActivityEntry[] }
  | { status: "unavailable"; message: string };

const SOURCE_LIMIT = 15;

export async function getRecentActivity(limit = 20, client?: SupabaseClient): Promise<RecentActivity> {
  if (!client && !isSupabaseAdminConfigured()) {
    return { status: "unavailable", message: "Supabase env vars are not configured." };
  }

  try {
    const supabase = client ?? getSupabaseAdminClient();
    const [decisions, runs, outputs, campaignEvents] = await Promise.all([
      supabase
        .from("approval_decisions")
        .select("id,approval_item_id,decision,decided_by,decided_at,decision_notes")
        .order("decided_at", { ascending: false })
        .limit(SOURCE_LIMIT),
      supabase
        .from("agent_run_logs")
        .select("id,task_id,run_status,model_provider,model_name,reasoning_summary,error_message,started_at,completed_at,created_at")
        .order("created_at", { ascending: false })
        .limit(SOURCE_LIMIT),
      supabase
        .from("agent_outputs")
        .select("id,task_id,approval_item_id,title,output_type,risk_level,compliance_status,approval_status,created_at")
        .order("created_at", { ascending: false })
        .limit(SOURCE_LIMIT),
      supabase
        .from("campaign_events")
        .select("id,campaign_id,approval_item_id,event_type,actor,detail,occurred_at")
        .order("occurred_at", { ascending: false })
        .limit(SOURCE_LIMIT),
    ]);

    assertOk("approval_decisions", decisions.error);
    assertOk("agent_run_logs", runs.error);
    assertOk("agent_outputs", outputs.error);
    assertOk("campaign_events", campaignEvents.error);

    const entries: ActivityEntry[] = [
      ...rows(decisions.data).map(mapDecision),
      ...rows(runs.data).map(mapRun),
      ...rows(outputs.data).map(mapOutput),
      ...rows(campaignEvents.data).map(mapCampaignEvent),
    ];

    return { status: "live", entries: mergeActivityEntries(entries, limit) };
  } catch (error) {
    return { status: "unavailable", message: error instanceof Error ? error.message : "Activity is unavailable." };
  }
}

/** Pure merge: drop entries with no timestamp, sort newest-first, cap to `limit`. */
export function mergeActivityEntries(entries: ActivityEntry[], limit: number): ActivityEntry[] {
  return entries
    .filter((entry) => Boolean(entry.occurredAt))
    .slice()
    .sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt))
    .slice(0, limit);
}

function mapDecision(row: Record<string, unknown>): ActivityEntry {
  const decision = str(row.decision) ?? "decision";
  const approvalId = str(row.approval_item_id);
  const decidedBy = str(row.decided_by) ?? "Operator";
  return {
    id: `decision:${String(row.id)}`,
    kind: "decision",
    tone: decisionTone(decision),
    title: `Approval ${titleize(decision)}`,
    detail: str(row.decision_notes) ?? `Decision recorded by ${decidedBy}.`,
    actor: decidedBy,
    occurredAt: str(row.decided_at) ?? "",
    href: approvalId ? `/approvals?item=${approvalId}` : null,
  };
}

function mapRun(row: Record<string, unknown>): ActivityEntry {
  const status = str(row.run_status) ?? "queued";
  const taskId = str(row.task_id);
  const error = str(row.error_message);
  return {
    id: `run:${String(row.id)}`,
    kind: "run",
    tone: error ? "red" : runTone(status),
    title: `Run ${titleize(status)}`,
    detail: error ?? str(row.reasoning_summary) ?? str(row.model_name) ?? "Agent run logged.",
    actor: str(row.model_name) ?? str(row.model_provider) ?? "Agent",
    occurredAt: str(row.completed_at) ?? str(row.started_at) ?? str(row.created_at) ?? "",
    href: taskId ? `/agent-operations/tasks/${taskId}` : null,
  };
}

function mapOutput(row: Record<string, unknown>): ActivityEntry {
  const approvalId = str(row.approval_item_id);
  const taskId = str(row.task_id);
  const compliance = str(row.compliance_status) ?? "";
  const approval = str(row.approval_status) ?? "";
  const risk = str(row.risk_level) ?? "";
  return {
    id: `draft:${String(row.id)}`,
    kind: "draft",
    tone: outputTone(`${compliance} ${approval} ${risk}`),
    title: str(row.title) ?? "Agent draft created",
    detail: `${titleize(str(row.output_type) ?? "draft")} · ${titleize(approval || compliance || "pending approval")}`,
    actor: "Hermes",
    occurredAt: str(row.created_at) ?? "",
    href: approvalId ? `/approvals?item=${approvalId}` : taskId ? `/agent-operations/tasks/${taskId}` : null,
  };
}

function mapCampaignEvent(row: Record<string, unknown>): ActivityEntry {
  const eventType = str(row.event_type) ?? "campaign_event";
  const approvalId = str(row.approval_item_id);
  return {
    id: `campaign:${String(row.id)}`,
    kind: "campaign",
    tone: campaignTone(eventType),
    title: titleize(eventType),
    detail: str(row.detail) ?? "Campaign lifecycle update.",
    actor: str(row.actor) ?? "System",
    occurredAt: str(row.occurred_at) ?? "",
    href: approvalId ? `/approvals?item=${approvalId}` : null,
  };
}

function decisionTone(decision: string): ActivityTone {
  const value = decision.toLowerCase();
  if (value.includes("approve")) return "green";
  if (value.includes("decline") || value.includes("reject")) return "red";
  if (value.includes("revis")) return "amber";
  if (value.includes("archiv")) return "gray";
  return "blue";
}

function runTone(status: string): ActivityTone {
  const value = status.toLowerCase();
  if (value === "completed" || value === "succeeded") return "green";
  if (value === "failed" || value === "error") return "red";
  if (value === "running") return "blue";
  return "gray";
}

function outputTone(signals: string): ActivityTone {
  const value = signals.toLowerCase();
  if (value.includes("blocked")) return "red";
  if (value.includes("approved")) return "green";
  if (value.includes("needs") || value.includes("revision")) return "amber";
  return "blue";
}

function campaignTone(eventType: string): ActivityTone {
  const value = eventType.toLowerCase();
  if (value.includes("block")) return "red";
  if (value.includes("approv")) return "green";
  if (value.includes("reject") || value.includes("declin")) return "red";
  return "blue";
}

function rows(data: unknown): Array<Record<string, unknown>> {
  return Array.isArray(data) ? (data as Array<Record<string, unknown>>) : [];
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function titleize(value: string): string {
  return value
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function assertOk(table: string, error: { message?: string } | null) {
  if (error) {
    throw new Error(`${table} lookup failed: ${error.message ?? "Unknown Supabase error"}`);
  }
}
