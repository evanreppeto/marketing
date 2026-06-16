import { type SupabaseClient } from "@supabase/supabase-js";

import {
  deriveTaskUrgency,
  type ActorKind,
  type CrmActivityType,
  type CrmEntityType,
  type TaskPriority,
  type TaskStatus,
  type TaskUrgency,
} from "@/domain";
import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/server";

export type ActivityTone = "green" | "red" | "amber" | "blue" | "gray";

export type TimelineEntry = {
  id: string;
  activityType: CrmActivityType;
  tone: ActivityTone;
  summary: string;
  detail: string | null;
  actorKind: ActorKind;
  actorLabel: string;
  occurredAt: string;
};

export type NoteEntry = {
  id: string;
  body: string;
  isPinned: boolean;
  isInternal: boolean;
  actorKind: ActorKind;
  actorLabel: string;
  createdAt: string;
};

export type TaskEntry = {
  id: string;
  title: string;
  description: string | null;
  dueAt: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  urgency: TaskUrgency;
  assigneeLabel: string | null;
  actorKind: ActorKind;
  actorLabel: string;
  createdAt: string;
};

export type TimelineResult =
  | { status: "live"; entries: TimelineEntry[] }
  | { status: "unavailable"; message: string };
export type NotesResult =
  | { status: "live"; notes: NoteEntry[] }
  | { status: "unavailable"; message: string };
export type TasksResult =
  | { status: "live"; tasks: TaskEntry[] }
  | { status: "unavailable"; message: string };

const ACTIVITY_TONE: Record<CrmActivityType, ActivityTone> = {
  note_added: "blue",
  status_changed: "amber",
  call_logged: "blue",
  email_logged: "blue",
  sms_logged: "blue",
  meeting_logged: "blue",
  task_created: "amber",
  task_completed: "green",
  record_created: "green",
  record_updated: "blue",
  ai_recommendation: "amber",
  approval_requested: "amber",
  approval_decided: "green",
  converted: "green",
  file_added: "blue",
};

function actorLabel(kind: ActorKind, name: string | null): string {
  if (name && name.trim()) return name.trim();
  if (kind === "agent") return "Arc";
  if (kind === "system") return "System";
  return "Operator";
}

function client(injected?: SupabaseClient) {
  return injected ?? getSupabaseAdminClient();
}

function unavailable(message: string): { status: "unavailable"; message: string } {
  return { status: "unavailable", message };
}

export async function getRecordTimeline(
  entityType: CrmEntityType,
  entityId: string,
  orgId: string,
  injected?: SupabaseClient,
): Promise<TimelineResult> {
  if (!injected && !isSupabaseAdminConfigured()) return unavailable("Supabase is not configured.");
  const { data, error } = await client(injected)
    .from("crm_activities")
    .select("id,activity_type,summary,detail,actor_kind,actor_name,occurred_at")
    .eq("org_id", orgId)
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .order("occurred_at", { ascending: false })
    .limit(100);
  if (error) return unavailable(error.message);
  const rows = (data ?? []) as Array<{
    id: string;
    activity_type: CrmActivityType;
    summary: string;
    detail: string | null;
    actor_kind: ActorKind;
    actor_name: string | null;
    occurred_at: string;
  }>;
  return {
    status: "live",
    entries: rows.map((row) => ({
      id: row.id,
      activityType: row.activity_type,
      tone: ACTIVITY_TONE[row.activity_type] ?? "gray",
      summary: row.summary,
      detail: row.detail,
      actorKind: row.actor_kind,
      actorLabel: actorLabel(row.actor_kind, row.actor_name),
      occurredAt: row.occurred_at,
    })),
  };
}

export async function getRecordNotes(
  entityType: CrmEntityType,
  entityId: string,
  orgId: string,
  injected?: SupabaseClient,
): Promise<NotesResult> {
  if (!injected && !isSupabaseAdminConfigured()) return unavailable("Supabase is not configured.");
  const { data, error } = await client(injected)
    .from("crm_notes")
    .select("id,body,is_pinned,is_internal,author_kind,author_name,created_at")
    .eq("org_id", orgId)
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) return unavailable(error.message);
  const rows = (data ?? []) as Array<{
    id: string;
    body: string;
    is_pinned: boolean;
    is_internal: boolean;
    author_kind: ActorKind;
    author_name: string | null;
    created_at: string;
  }>;
  const notes: NoteEntry[] = rows.map((row) => ({
    id: row.id,
    body: row.body,
    isPinned: row.is_pinned,
    isInternal: row.is_internal,
    actorKind: row.author_kind,
    actorLabel: actorLabel(row.author_kind, row.author_name),
    createdAt: row.created_at,
  }));
  // Pinned first, otherwise preserve the created_at-desc order from the query.
  notes.sort((a, b) => Number(b.isPinned) - Number(a.isPinned));
  return { status: "live", notes };
}

export async function getRecordTasks(
  entityType: CrmEntityType,
  entityId: string,
  orgId: string,
  injected?: SupabaseClient,
  now: Date = new Date(),
): Promise<TasksResult> {
  if (!injected && !isSupabaseAdminConfigured()) return unavailable("Supabase is not configured.");
  const { data, error } = await client(injected)
    .from("crm_tasks")
    .select(
      "id,title,description,due_at,priority,status,assignee_kind,assignee_name,author_kind,author_name,created_at",
    )
    .eq("org_id", orgId)
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .order("due_at", { ascending: true, nullsFirst: false })
    .limit(200);
  if (error) return unavailable(error.message);
  const rows = (data ?? []) as Array<{
    id: string;
    title: string;
    description: string | null;
    due_at: string | null;
    priority: TaskPriority;
    status: TaskStatus;
    assignee_kind: ActorKind | null;
    assignee_name: string | null;
    author_kind: ActorKind;
    author_name: string | null;
    created_at: string;
  }>;
  return {
    status: "live",
    tasks: rows.map((row) => ({
      id: row.id,
      title: row.title,
      description: row.description,
      dueAt: row.due_at,
      priority: row.priority,
      status: row.status,
      urgency: deriveTaskUrgency(row.due_at, now),
      assigneeLabel: row.assignee_kind ? actorLabel(row.assignee_kind, row.assignee_name) : null,
      actorKind: row.author_kind,
      actorLabel: actorLabel(row.author_kind, row.author_name),
      createdAt: row.created_at,
    })),
  };
}
