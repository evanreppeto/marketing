import {
  type ActivityInput,
  type CrmActivityType,
  type NoteInput,
  type TaskInput,
} from "@/domain";
import { getCurrentOrgId } from "@/lib/auth/org";
import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/server";

export type PersistResult = { ok: true; id: string } | { ok: false; error: string };

const NOT_CONFIGURED = "Supabase is not configured, so nothing was written.";

/** Write a free-standing activity row (also used as a companion to notes/tasks). */
export async function insertActivity(input: ActivityInput): Promise<PersistResult> {
  if (!isSupabaseAdminConfigured()) return { ok: false, error: NOT_CONFIGURED };
  const orgId = await getCurrentOrgId();
  const { data, error } = await getSupabaseAdminClient()
    .from("crm_activities")
    .insert({
      org_id: orgId,
      entity_type: input.entityType,
      entity_id: input.entityId,
      activity_type: input.activityType,
      summary: input.summary,
      detail: input.detail ?? null,
      actor_kind: input.actorKind,
      actor_name: input.actorName ?? null,
      metadata: (input.metadata ?? {}) as never,
    })
    .select("id")
    .single<{ id: string }>();
  if (error) return { ok: false, error: error.message };
  return { ok: true, id: data.id };
}

/** Internal helper so note/task writes can log a companion activity without re-fetching the org. */
async function logCompanionActivity(
  orgId: string,
  input: Omit<ActivityInput, "metadata"> & { metadata?: Record<string, unknown> },
): Promise<void> {
  await getSupabaseAdminClient()
    .from("crm_activities")
    .insert({
      org_id: orgId,
      entity_type: input.entityType,
      entity_id: input.entityId,
      activity_type: input.activityType,
      summary: input.summary,
      detail: input.detail ?? null,
      actor_kind: input.actorKind,
      actor_name: input.actorName ?? null,
      metadata: (input.metadata ?? {}) as never,
    });
}

export async function insertNote(input: NoteInput): Promise<PersistResult> {
  if (!isSupabaseAdminConfigured()) return { ok: false, error: NOT_CONFIGURED };
  const orgId = await getCurrentOrgId();
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("crm_notes")
    .insert({
      org_id: orgId,
      entity_type: input.entityType,
      entity_id: input.entityId,
      body: input.body,
      is_pinned: input.isPinned,
      is_internal: input.isInternal,
      author_kind: input.authorKind,
      author_name: input.authorName ?? null,
    })
    .select("id")
    .single<{ id: string }>();
  if (error) return { ok: false, error: error.message };

  await logCompanionActivity(orgId, {
    entityType: input.entityType,
    entityId: input.entityId,
    activityType: "note_added",
    summary: "Note added",
    detail: input.body.slice(0, 280),
    actorKind: input.authorKind,
    actorName: input.authorName,
    metadata: { note_id: data.id },
  });

  return { ok: true, id: data.id };
}

export async function insertTask(input: TaskInput): Promise<PersistResult> {
  if (!isSupabaseAdminConfigured()) return { ok: false, error: NOT_CONFIGURED };
  const orgId = await getCurrentOrgId();
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("crm_tasks")
    .insert({
      org_id: orgId,
      entity_type: input.entityType,
      entity_id: input.entityId,
      title: input.title,
      description: input.description ?? null,
      due_at: input.dueAt ?? null,
      priority: input.priority,
      status: input.status,
      assignee_kind: input.assigneeKind ?? null,
      assignee_name: input.assigneeName ?? null,
      author_kind: input.authorKind,
      author_name: input.authorName ?? null,
    })
    .select("id")
    .single<{ id: string }>();
  if (error) return { ok: false, error: error.message };

  if (input.entityType && input.entityId) {
    await logCompanionActivity(orgId, {
      entityType: input.entityType,
      entityId: input.entityId,
      activityType: "task_created",
      summary: `Task created: ${input.title}`,
      actorKind: input.authorKind,
      actorName: input.authorName,
      metadata: { task_id: data.id },
    });
  }

  return { ok: true, id: data.id };
}

/** Mark a task completed (or another terminal status) and log a companion activity. */
export async function updateTaskStatus(
  taskId: string,
  status: TaskInput["status"],
  actor: { kind: NoteInput["authorKind"]; name?: string },
): Promise<PersistResult> {
  if (!isSupabaseAdminConfigured()) return { ok: false, error: NOT_CONFIGURED };
  const orgId = await getCurrentOrgId();
  const supabase = getSupabaseAdminClient();
  const completedAt = status === "completed" ? new Date().toISOString() : null;

  const { data, error } = await supabase
    .from("crm_tasks")
    .update({ status, completed_at: completedAt })
    .eq("id", taskId)
    .eq("org_id", orgId)
    .select("id,title,entity_type,entity_id")
    .single<{
      id: string;
      title: string;
      entity_type: ActivityInput["entityType"] | null;
      entity_id: string | null;
    }>();
  if (error) return { ok: false, error: error.message };

  if (status === "completed" && data.entity_type && data.entity_id) {
    const activityType: CrmActivityType = "task_completed";
    await logCompanionActivity(orgId, {
      entityType: data.entity_type,
      entityId: data.entity_id,
      activityType,
      summary: `Task completed: ${data.title}`,
      actorKind: actor.kind,
      actorName: actor.name,
      metadata: { task_id: data.id },
    });
  }

  return { ok: true, id: data.id };
}

/** Toggle a note's pinned flag (org-scoped). */
export async function setNotePinned(noteId: string, isPinned: boolean): Promise<PersistResult> {
  if (!isSupabaseAdminConfigured()) return { ok: false, error: NOT_CONFIGURED };
  const orgId = await getCurrentOrgId();
  const { data, error } = await getSupabaseAdminClient()
    .from("crm_notes")
    .update({ is_pinned: isPinned })
    .eq("id", noteId)
    .eq("org_id", orgId)
    .select("id")
    .single<{ id: string }>();
  if (error) return { ok: false, error: error.message };
  return { ok: true, id: data.id };
}
