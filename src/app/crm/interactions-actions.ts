"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  parseActivityInput,
  parseNoteInput,
  parseTaskInput,
  type CrmEntityType,
} from "@/domain";
import { getOperatorActor, requireOperator } from "@/lib/auth/operator";
import {
  insertActivity,
  insertNote,
  insertTask,
  setNotePinned,
  updateTaskStatus,
} from "@/lib/interactions/persistence";
import {
  CRM_OBJECT_KEY_FOR_ENTITY,
  isCrmEntityType,
  recordPath,
  safeRecordPath,
} from "./_data/record-path";

function field(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function revalidateRecord(entityType: CrmEntityType, entityId: string): void {
  revalidatePath(recordPath(entityType, entityId));
  revalidatePath(`/crm/${CRM_OBJECT_KEY_FOR_ENTITY[entityType]}`);
}

// getOperatorActor() resolves the signed-in user (Supabase auth mode) or the
// configured operator label, so notes/tasks/activity carry a real per-actor trail.

export async function addNoteAction(formData: FormData) {
  await requireOperator();
  const entityType = field(formData, "entityType");
  const entityId = field(formData, "entityId");

  const parsed = parseNoteInput({
    entityType,
    entityId,
    body: field(formData, "body"),
    isInternal: formData.get("isInternal") === "on",
    authorKind: "human",
    authorName: await getOperatorActor(),
  });
  if (!parsed.ok) {
    redirect(`${safeRecordPath(entityType, entityId)}?action=note-error&message=${encodeURIComponent(parsed.error)}`);
  }

  const result = await insertNote(parsed.value);
  if (!result.ok) {
    redirect(`${recordPath(parsed.value.entityType, parsed.value.entityId)}?action=note-error&message=${encodeURIComponent(result.error)}`);
  }

  revalidateRecord(parsed.value.entityType, parsed.value.entityId);
  redirect(`${recordPath(parsed.value.entityType, parsed.value.entityId)}?action=note-added`);
}

export async function createTaskAction(formData: FormData) {
  await requireOperator();
  const entityType = field(formData, "entityType");
  const entityId = field(formData, "entityId");
  const dueDate = field(formData, "dueAt");

  const parsed = parseTaskInput({
    entityType,
    entityId,
    title: field(formData, "title"),
    description: field(formData, "description"),
    dueAt: dueDate ? new Date(dueDate).toISOString() : null,
    priority: field(formData, "priority") || "normal",
    authorKind: "human",
    authorName: await getOperatorActor(),
  });
  if (!parsed.ok) {
    redirect(`${safeRecordPath(entityType, entityId)}?action=task-error&message=${encodeURIComponent(parsed.error)}`);
  }

  const result = await insertTask(parsed.value);
  if (!result.ok) {
    redirect(`${safeRecordPath(entityType, entityId)}?action=task-error&message=${encodeURIComponent(result.error)}`);
  }

  if (isCrmEntityType(entityType)) revalidateRecord(entityType, entityId);
  redirect(`${safeRecordPath(entityType, entityId)}?action=task-created`);
}

export async function completeTaskAction(formData: FormData) {
  await requireOperator();
  const taskId = field(formData, "taskId");
  const entityType = field(formData, "entityType");
  const entityId = field(formData, "entityId");

  const result = await updateTaskStatus(taskId, "completed", {
    kind: "human",
    name: await getOperatorActor(),
  });
  if (!result.ok) {
    redirect(`${safeRecordPath(entityType, entityId)}?action=task-error&message=${encodeURIComponent(result.error)}`);
  }

  if (isCrmEntityType(entityType)) revalidateRecord(entityType, entityId);
  redirect(`${safeRecordPath(entityType, entityId)}?action=task-completed`);
}

export async function logActivityAction(formData: FormData) {
  await requireOperator();
  const entityType = field(formData, "entityType");
  const entityId = field(formData, "entityId");

  const parsed = parseActivityInput({
    entityType,
    entityId,
    activityType: field(formData, "activityType"),
    summary: field(formData, "summary"),
    detail: field(formData, "detail"),
    actorKind: "human",
    actorName: await getOperatorActor(),
  });
  if (!parsed.ok) {
    redirect(`${safeRecordPath(entityType, entityId)}?action=activity-error&message=${encodeURIComponent(parsed.error)}`);
  }

  const result = await insertActivity(parsed.value);
  if (!result.ok) {
    redirect(`${recordPath(parsed.value.entityType, parsed.value.entityId)}?action=activity-error&message=${encodeURIComponent(result.error)}`);
  }

  revalidateRecord(parsed.value.entityType, parsed.value.entityId);
  redirect(`${recordPath(parsed.value.entityType, parsed.value.entityId)}?action=activity-logged`);
}

export async function pinNoteAction(formData: FormData) {
  await requireOperator();
  const noteId = field(formData, "noteId");
  const entityType = field(formData, "entityType");
  const entityId = field(formData, "entityId");
  const pinned = formData.get("isPinned") === "true";

  const result = await setNotePinned(noteId, pinned);
  if (!result.ok) {
    redirect(`${safeRecordPath(entityType, entityId)}?action=note-error&message=${encodeURIComponent(result.error)}`);
  }

  if (isCrmEntityType(entityType)) revalidateRecord(entityType, entityId);
  redirect(`${safeRecordPath(entityType, entityId)}?action=note-updated`);
}
