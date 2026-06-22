import { type SupabaseClient } from "@supabase/supabase-js";

import { isDemoDataEnabled } from "../demo/demo-mode";
import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "../supabase/server";
import { buildDemoActivity } from "./demo";

/**
 * Unified activity log. The control plane already WRITES a full audit trail
 * (human approval decisions, agent run logs, generated drafts, campaign
 * lifecycle events) but, before this, never read it back. This read-model
 * merges those real tables into one chronological feed.
 */
export type ActivityKind = "decision" | "run" | "draft" | "campaign" | "event";
export type ActivityTone = "green" | "red" | "amber" | "blue" | "gray";
export type ActivityActorType = "human" | "arc" | "sub_agent" | "integration" | "system";
export type ActivityCategory = "approval" | "campaign" | "crm" | "asset" | "agent" | "integration" | "risk" | "system";
export type ActivityInsightLabel =
  | "Needs review"
  | "Marketing progress"
  | "Risk blocked"
  | "Data changed"
  | "Agent work"
  | "Customer signal"
  | "Campaign result";

export type ActivityEntry = {
  id: string;
  kind: ActivityKind;
  tone: ActivityTone;
  title: string;
  detail: string;
  actor: string;
  actorType: ActivityActorType;
  category: ActivityCategory;
  insightLabel: ActivityInsightLabel | null;
  relatedLabel: string | null;
  occurredAt: string;
  href: string | null;
};

export type ActivityQuery = {
  categories?: ActivityCategory[];
  actorTypes?: ActivityActorType[];
  needsReview?: boolean;
  since?: string;
  until?: string;
  search?: string;
  limit?: number;
};

export type ActivitySummary = {
  needsReview: number;
  arcActions: number;
  campaignProgress: number;
  blockedOrRisky: number;
};

export type ActivityDayGroup = {
  label: string;
  entries: ActivityEntry[];
};

export type RecentActivity =
  | { status: "live"; entries: ActivityEntry[]; summary: ActivitySummary; groups: ActivityDayGroup[] }
  | { status: "unavailable"; message: string };

const SOURCE_LIMIT = 50;
const NEEDS_REVIEW_SOURCE_LIMIT = 250;
const DEFAULT_LIMIT = 100;
const ACTIVE_REVIEW_STATUSES = new Set(["needs_compliance", "pending_approval", "pending_owner_approval", "revision_requested"]);
const TERMINAL_REVIEW_STATUSES = new Set(["approved", "rejected", "declined", "archived"]);

export async function getRecentActivity(query: ActivityQuery = {}, client?: SupabaseClient): Promise<RecentActivity> {
  const limit = query.limit ?? DEFAULT_LIMIT;
  const sourceLimit = sourceLimitForQuery(query);

  if (!client && !isSupabaseAdminConfigured()) {
    return isDemoDataEnabled()
      ? buildDemoActivity(query)
      : { status: "unavailable", message: "Activity is unavailable." };
  }

  try {
    const supabase = client ?? getSupabaseAdminClient();
    const [decisions, runs, outputs, campaignEvents, events] = await Promise.all([
      supabase
        .from("approval_decisions")
        .select("id,approval_item_id,decision,decided_by,decided_at,decision_notes")
        .order("decided_at", { ascending: false })
        .limit(sourceLimit),
      supabase
        .from("agent_run_logs")
        .select("id,task_id,run_status,model_provider,model_name,reasoning_summary,error_message,started_at,completed_at,created_at")
        .order("created_at", { ascending: false })
        .limit(sourceLimit),
      supabase
        .from("agent_outputs")
        .select("id,task_id,approval_item_id,title,output_type,risk_level,compliance_status,approval_status,created_at")
        .order("created_at", { ascending: false })
        .limit(sourceLimit),
      supabase
        .from("campaign_events")
        .select("id,campaign_id,approval_item_id,event_type,actor,detail,payload,occurred_at")
        .order("occurred_at", { ascending: false })
        .limit(sourceLimit),
      supabase
        .from("events")
        .select("id,actor,subject_type,subject_id,type,payload,occurred_at")
        .order("occurred_at", { ascending: false })
        .limit(sourceLimit),
    ]);

    const sources = [
      collectSource("approval_decisions", decisions, mapDecision),
      collectSource("agent_run_logs", runs, mapRun),
      collectSource("agent_outputs", outputs, mapOutput),
      collectSource("campaign_events", campaignEvents, mapCampaignEvent),
      collectSource("events", events, mapEvent),
    ];

    // One drifted column or failing table must not blank the entire feed: each
    // source degrades to zero rows (logged) while the others still render. Only
    // a total failure (every source errored — e.g. the DB is unreachable) falls
    // back to the unavailable state.
    if (sources.every((source) => !source.ok)) {
      const firstError = sources.find((source) => source.error)?.error;
      return { status: "unavailable", message: firstError ?? "Activity is unavailable." };
    }

    const entries: ActivityEntry[] = sources.flatMap((source) => source.entries);

    const filtered = applyActivityFilters(entries, query);
    const merged = mergeActivityEntries(filtered, limit);

    // Connected but no audit trail recorded yet: only show the demo preview
    // when the demo flag is enabled; otherwise fall through to real empty feed.
    if (merged.length === 0 && !hasActiveQuery(query)) {
      if (isDemoDataEnabled()) return buildDemoActivity(query);
    }

    return {
      status: "live",
      entries: merged,
      summary: buildActivitySummary(merged),
      groups: groupActivityEntriesByDay(merged),
    };
  } catch (error) {
    return { status: "unavailable", message: error instanceof Error ? error.message : "Activity is unavailable." };
  }
}

export function sourceLimitForQuery(query: ActivityQuery): number {
  return query.needsReview === true ? NEEDS_REVIEW_SOURCE_LIMIT : SOURCE_LIMIT;
}

/**
 * True when the query narrows results (filters/search/needs-review/time bounds).
 * Used to decide whether an empty live result should fall back to demo data: we
 * only seed the preview for an unfiltered, genuinely-empty feed — a filter that
 * legitimately matches nothing must still show "No activity found".
 */
function hasActiveQuery(query: ActivityQuery): boolean {
  return Boolean(
    query.categories?.length ||
      query.actorTypes?.length ||
      query.needsReview ||
      query.search ||
      query.since ||
      query.until,
  );
}

/** Pure merge: drop entries with no timestamp, sort newest-first, cap to `limit`. */
export function mergeActivityEntries(entries: ActivityEntry[], limit: number): ActivityEntry[] {
  return entries
    .filter((entry) => Boolean(entry.occurredAt))
    .slice()
    .sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt))
    .slice(0, limit);
}

export function applyActivityFilters(entries: ActivityEntry[], query: ActivityQuery): ActivityEntry[] {
  const categorySet = query.categories?.length ? new Set(query.categories) : null;
  const actorSet = query.actorTypes?.length ? new Set(query.actorTypes) : null;
  const since = query.since ? Date.parse(query.since) : null;
  const until = query.until ? Date.parse(query.until) : null;
  const search = normalizeSearch(query.search);

  return entries.filter((entry) => {
    if (categorySet && !categorySet.has(entry.category)) return false;
    if (actorSet && !actorSet.has(entry.actorType)) return false;
    if (query.needsReview && !isNeedsReviewEntry(entry)) return false;

    const time = Date.parse(entry.occurredAt);
    if (since !== null && Number.isFinite(since) && time < since) return false;
    if (until !== null && Number.isFinite(until) && time > until) return false;

    if (!search) return true;

    const haystack = [
      entry.title,
      entry.detail,
      entry.actor,
      entry.relatedLabel ?? "",
      entry.category,
      entry.actorType,
      entry.insightLabel ?? "",
    ]
      .join(" ")
      .toLowerCase();

    return haystack.includes(search);
  });
}

export function buildActivitySummary(entries: ActivityEntry[]): ActivitySummary {
  return {
    needsReview: entries.filter(isNeedsReviewEntry).length,
    arcActions: entries.filter((entry) => entry.actorType === "arc" || entry.actorType === "sub_agent").length,
    campaignProgress: entries.filter(
      (entry) => entry.category === "campaign" || entry.insightLabel === "Marketing progress",
    ).length,
    blockedOrRisky: entries.filter(
      (entry) => entry.category === "risk" || entry.tone === "red" || entry.insightLabel === "Risk blocked",
    ).length,
  };
}

export function groupActivityEntriesByDay(entries: ActivityEntry[], now = new Date()): ActivityDayGroup[] {
  const groups = new Map<string, ActivityEntry[]>();

  for (const entry of entries) {
    const label = dayLabel(entry.occurredAt, now);
    groups.set(label, [...(groups.get(label) ?? []), entry]);
  }

  return Array.from(groups, ([label, groupedEntries]) => ({ label, entries: groupedEntries }));
}

function isNeedsReviewEntry(entry: ActivityEntry): boolean {
  return entry.insightLabel === "Needs review";
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
    actorType: "human",
    category: "approval",
    insightLabel: insightForDecision(decision),
    relatedLabel: approvalId ? "Approval item" : null,
    occurredAt: str(row.decided_at) ?? "",
    href: approvalId ? `/approvals?item=${approvalId}` : null,
  };
}

function mapRun(row: Record<string, unknown>): ActivityEntry {
  const status = str(row.run_status) ?? "queued";
  const taskId = str(row.task_id);
  const error = str(row.error_message);
  const actor = str(row.model_name) ?? str(row.model_provider) ?? "Agent";

  return {
    id: `run:${String(row.id)}`,
    kind: "run",
    tone: error ? "red" : runTone(status),
    title: `Run ${titleize(status)}`,
    detail: error ?? str(row.reasoning_summary) ?? str(row.model_name) ?? "Agent run logged.",
    actor,
    actorType: agentActorType(actor),
    category: error ? "risk" : "agent",
    insightLabel: error ? "Risk blocked" : "Agent work",
    relatedLabel: taskId ? "Agent task" : null,
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
  const tone = outputTone(`${compliance} ${approval} ${risk}`);

  return {
    id: `draft:${String(row.id)}`,
    kind: "draft",
    tone,
    title: str(row.title) ?? "Agent draft created",
    detail: `${titleize(str(row.output_type) ?? "draft")} - ${titleize(approval || compliance || "pending approval")}`,
    actor: "Arc",
    actorType: "arc",
    category: tone === "red" ? "risk" : "asset",
    insightLabel: insightForOutput(approval, compliance, tone),
    relatedLabel: str(row.title) ?? titleize(str(row.output_type) ?? "Draft"),
    occurredAt: str(row.created_at) ?? "",
    href: approvalId ? `/approvals?item=${approvalId}` : taskId ? `/agent-operations/tasks/${taskId}` : null,
  };
}

export function mapCampaignEvent(row: Record<string, unknown>): ActivityEntry {
  const eventType = str(row.event_type) ?? "campaign_event";
  const approvalId = str(row.approval_item_id);
  const campaignId = str(row.campaign_id);
  const payload = object(row.payload);
  const detail = str(row.detail);
  const decisionSignal = campaignDecisionSignal(eventType, payload, detail);
  const tone = campaignTone(eventType, decisionSignal);
  const actor = displayActor(str(row.actor));

  return {
    id: `campaign:${String(row.id)}`,
    kind: "campaign",
    tone,
    title: campaignEventTitle(eventType, decisionSignal),
    detail: detail ?? "Campaign lifecycle update.",
    actor,
    actorType: actorTypeFromActor(actor),
    category: tone === "red" ? "risk" : "campaign",
    insightLabel: insightForCampaignEvent(eventType, tone),
    relatedLabel: detail ?? "Campaign update",
    occurredAt: str(row.occurred_at) ?? "",
    href: approvalId ? `/approvals?item=${approvalId}` : campaignId ? `/campaigns/${campaignId}` : null,
  };
}

export function mapEvent(row: Record<string, unknown>): ActivityEntry {
  const subjectType = str(row.subject_type) ?? "record";
  const subjectId = str(row.subject_id);
  const eventType = str(row.type) ?? "record.updated";
  const payload = object(row.payload);
  const title = str(payload.title) ?? titleize(eventType);
  const detail = str(payload.detail) ?? `${titleize(subjectType)} activity recorded.`;
  const actor = displayActor(str(row.actor));

  return {
    id: `event:${String(row.id)}`,
    kind: "event",
    tone: eventTone(eventType),
    title,
    detail,
    actor,
    actorType: actorTypeFromActor(actor),
    category: categoryForEvent(subjectType, eventType),
    insightLabel: insightForEvent(subjectType, eventType),
    relatedLabel: str(payload.relatedLabel) ?? titleize(subjectType),
    occurredAt: str(row.occurred_at) ?? "",
    href: hrefForSubject(subjectType, subjectId),
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

function insightForDecision(decision: string): ActivityInsightLabel {
  const value = normalizeStatus(decision);
  if (value.includes("approve")) return "Marketing progress";
  if (value.includes("decline") || value.includes("reject")) return "Risk blocked";
  return "Data changed";
}

function insightForOutput(approval: string, compliance: string, tone: ActivityTone): ActivityInsightLabel {
  if (isActiveReviewStatus(approval) || isActiveReviewStatus(compliance)) return "Needs review";
  if (!approval && !compliance) return "Needs review";
  if (isApprovedStatus(approval)) return "Marketing progress";
  if (tone === "red") return "Risk blocked";
  if (isTerminalReviewStatus(approval) || isTerminalReviewStatus(compliance)) return "Data changed";
  return "Agent work";
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
  if (value.includes("blocked") || value.includes("rejected") || value.includes("declined")) return "red";
  if (value.includes("approved")) return "green";
  if (value.includes("needs") || value.includes("revision")) return "amber";
  return "blue";
}

function isActiveReviewStatus(value: string): boolean {
  return ACTIVE_REVIEW_STATUSES.has(normalizeStatus(value));
}

function isTerminalReviewStatus(value: string): boolean {
  return TERMINAL_REVIEW_STATUSES.has(normalizeStatus(value));
}

function isApprovedStatus(value: string): boolean {
  return normalizeStatus(value).includes("approved");
}

function normalizeStatus(value: string): string {
  return value.trim().toLowerCase().replaceAll("-", "_").replaceAll(" ", "_");
}

function campaignDecisionSignal(eventType: string, payload: Record<string, unknown>, detail: string | null): string | null {
  const value = normalizeStatus(eventType);
  if (!value.includes("approval")) return null;

  return str(payload.action) ?? str(payload.decision) ?? str(payload.next_status) ?? decisionSignalFromDetail(detail);
}

function decisionSignalFromDetail(detail: string | null): string | null {
  if (!detail) return null;
  const value = normalizeStatus(detail);
  if (value.includes("revision")) return "revision_requested";
  if (value.includes("decline")) return "declined";
  if (value.includes("reject")) return "rejected";
  if (value.includes("archive")) return "archived";
  if (value.includes("approve")) return "approved";
  return null;
}

function campaignEventTitle(eventType: string, decisionSignal: string | null): string {
  if (normalizeStatus(eventType) === "approval_decided" && decisionSignal) {
    return `Approval ${campaignDecisionLabel(decisionSignal)}`;
  }
  return titleize(eventType);
}

function campaignDecisionLabel(decisionSignal: string): string {
  const signal = normalizeStatus(decisionSignal);
  if (signal.includes("approve")) return "Approved";
  if (signal.includes("reject") || signal.includes("declin")) return "Declined";
  if (signal.includes("revis")) return "Revision Requested";
  if (signal.includes("archive")) return "Archived";
  return titleize(decisionSignal);
}

function campaignTone(eventType: string, decisionSignal: string | null): ActivityTone {
  const signal = normalizeStatus(decisionSignal ?? "");
  if (signal.includes("approve")) return "green";
  if (signal.includes("reject") || signal.includes("declin") || signal.includes("block")) return "red";
  if (signal.includes("revis") || signal.includes("pending") || signal.includes("needs")) return "amber";
  if (signal.includes("archive")) return "gray";

  const value = normalizeStatus(eventType);
  if (value.includes("block") || value.includes("reject") || value.includes("declin")) return "red";
  if (value.includes("submitted") || value.includes("review") || value.includes("pending") || value.includes("needs")) {
    return "amber";
  }
  if (value === "approval_decided") return "blue";
  if (value.includes("approved") || value.includes("launched") || value.includes("sent")) return "green";
  return "blue";
}

function insightForCampaignEvent(eventType: string, tone: ActivityTone): ActivityInsightLabel {
  if (tone === "red") return "Risk blocked";
  if (tone === "amber" && normalizeStatus(eventType).includes("submitted")) return "Needs review";
  if (tone === "green") return "Marketing progress";
  return "Data changed";
}

function eventTone(eventType: string): ActivityTone {
  const value = eventType.toLowerCase();
  if (value.includes("block") || value.includes("risk") || value.includes("fail")) return "red";
  if (value.includes("review") || value.includes("pending") || value.includes("needs")) return "amber";
  if (value.includes("campaign") || value.includes("created") || value.includes("completed")) return "green";
  if (value.includes("sync") || value.includes("integration")) return "blue";
  return "gray";
}

function normalizeSearch(value: string | undefined): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function dayLabel(occurredAt: string, now: Date): string {
  const date = new Date(occurredAt);
  if (!Number.isFinite(date.getTime())) return "Unknown date";

  const day = localDayStart(date);
  const today = localDayStart(now);
  const diffDays = Math.round((today - day) / 86_400_000);

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";

  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function localDayStart(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function displayActor(actor: string | null): string {
  if (!actor) return "System";
  if (actor.toLowerCase().startsWith("system.")) return "System";
  return titleize(actor);
}

function actorTypeFromActor(actor: string | null): ActivityActorType {
  const value = (actor ?? "").toLowerCase();
  if (!value || value === "system" || value.startsWith("system.")) return "system";
  if (/\barc\b/.test(value) || value === "arc") return "arc";
  if (value.includes("sub-agent") || value.includes("sub_agent") || value.includes("agent")) return "sub_agent";
  if (
    value.includes("integration") ||
    value.includes("quickbooks") ||
    value.includes("google") ||
    value.includes("supabase") ||
    value.includes("stripe") ||
    value.includes("zapier") ||
    value.includes("webhook") ||
    value.includes("api")
  ) {
    return "integration";
  }
  return "human";
}

function agentActorType(actor: string | null): ActivityActorType {
  const type = actorTypeFromActor(actor);
  if (type === "human") return "sub_agent";
  return type;
}

function categoryForEvent(subjectType: string, eventType: string): ActivityCategory {
  const subject = subjectType.toLowerCase();
  const event = eventType.toLowerCase();
  if (event.includes("risk") || event.includes("block")) return "risk";
  if (subjectIncludes(subject, ["asset", "draft"])) return "asset";
  if (subjectIncludes(subject, ["company", "contact", "property", "lead", "job", "outcome"])) return "crm";
  if (subject.includes("campaign")) return "campaign";
  if (subject.includes("approval")) return "approval";
  if (subject.includes("agent")) return "agent";
  if (event.includes("integration") || event.includes("sync")) return "integration";
  return "system";
}

function insightForEvent(subjectType: string, eventType: string): ActivityInsightLabel | null {
  const subject = subjectType.toLowerCase();
  const event = eventType.toLowerCase();
  if (event.includes("risk") || event.includes("block")) return "Risk blocked";
  if (event.includes("review") || event.includes("approval") || event.includes("pending")) return "Needs review";
  if (subject.includes("campaign")) {
    return event.includes("result") || event.includes("sent") || event.includes("launch")
      ? "Campaign result"
      : "Marketing progress";
  }
  if (subject.includes("agent")) return "Agent work";
  if (subjectIncludes(subject, ["company", "contact", "property", "lead", "job", "outcome"])) return "Customer signal";
  if (event.includes("sync") || event.includes("updated") || event.includes("changed") || event.includes("created")) {
    return "Data changed";
  }
  return "Data changed";
}

function subjectIncludes(subject: string, needles: string[]): boolean {
  return needles.some((needle) => subject.includes(needle));
}

function hrefForSubject(subjectType: string, subjectId: string | null): string | null {
  if (!subjectId) return null;

  const routes: Record<string, string> = {
    company: `/crm/companies/${subjectId}`,
    contact: `/crm/contacts/${subjectId}`,
    property: `/crm/properties/${subjectId}`,
    lead: `/crm/leads/${subjectId}`,
    job: `/crm/jobs/${subjectId}`,
    outcome: `/crm/outcomes/${subjectId}`,
    campaign: `/campaigns/${subjectId}`,
    approval: `/approvals?item=${subjectId}`,
    agent_task: `/agent-operations/tasks/${subjectId}`,
  };

  return routes[subjectType.toLowerCase()] ?? null;
}

function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function rows(data: unknown): Array<Record<string, unknown>> {
  return Array.isArray(data) ? (data as Array<Record<string, unknown>>) : [];
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function titleize(value: string): string {
  return value
    .replace(/[._-]+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

type ActivitySource = { ok: boolean; entries: ActivityEntry[]; error: string | null };

/**
 * Map one Supabase source into activity entries, tolerating per-source failure.
 * A drifted/missing column or RLS error on a single table degrades that source
 * to zero rows (logged) instead of throwing and blanking the whole feed.
 */
function collectSource(
  table: string,
  result: { data: unknown; error: { message?: string } | null },
  map: (row: Record<string, unknown>) => ActivityEntry,
): ActivitySource {
  if (result.error) {
    const message = result.error.message ?? "Unknown Supabase error";
    console.error(`[activity] ${table} lookup failed: ${message}`);
    return { ok: false, entries: [], error: `${table} lookup failed: ${message}` };
  }

  return { ok: true, entries: rows(result.data).map(map), error: null };
}
