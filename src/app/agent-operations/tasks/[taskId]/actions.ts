"use server";

import { revalidatePath } from "next/cache";

import { getCurrentAgentTaskTenantFields, type AgentTaskTenantFields } from "@/lib/agent-tasks/scope";
import { getOperatorActor, requireOperator } from "@/lib/auth/operator";
import { type Database, type Json } from "@/lib/supabase/database.types";
import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/server";

const EDITABLE_FIELDS = [
  "objective",
  "description",
  "status",
  "priority",
  "owner_label",
  "driver_kind",
  "driver_label",
  "approver_label",
  "due_at",
  "scheduled_for",
  "task_type",
  "campaign_id",
] as const;

const VALID_STATUSES = new Set(["queued", "running", "blocked", "needs_approval", "completed", "failed", "canceled"]);
const VALID_PRIORITIES = new Set(["low", "medium", "high", "urgent"]);
const VALID_DRIVER_KINDS = new Set(["human", "agent", "system"]);

export type EditableField = (typeof EDITABLE_FIELDS)[number];

export type ActionResult = { ok: true } | { ok: false; message: string };

type AgentTaskUpdate = Database["public"]["Tables"]["agent_tasks"]["Update"];
type AgentTaskStatus = Database["public"]["Enums"]["agent_task_status"];
type AgentTaskPriority = Database["public"]["Enums"]["agent_task_priority"];
type NormalizedFieldValue = { ok: true; value: string | null } | { ok: false; message: string };
type TenantScopeResult = { ok: true; tenant: AgentTaskTenantFields } | { ok: false; message: string };

type TaskMetadataRow = {
  metadata: Json | null;
};

type TaskIdentityRow = {
  id: string;
};

export async function updateTaskFieldAction(
  taskId: string,
  input: { field: EditableField; value: string | null },
): Promise<ActionResult> {
  await requireOperator();

  if (!isNonEmptyString(taskId)) {
    return { ok: false, message: "Task id is required." };
  }

  const payload = input as unknown;
  if (!isRecord(payload)) {
    return { ok: false, message: "Task update input is invalid." };
  }

  if (!isEditableField(payload.field)) {
    return { ok: false, message: "That field cannot be edited." };
  }

  const field = payload.field;
  const normalized = normalizeFieldValue(field, payload.value);
  if (!normalized.ok) {
    return normalized;
  }

  if (!isSupabaseAdminConfigured()) {
    return { ok: false, message: "Supabase is not configured." };
  }

  const supabase = getSupabaseAdminClient();
  const tenant = await resolveTenantScope();
  if (!tenant.ok) return tenant;

  const existingTask = await readScopedTaskIdentity(supabase, taskId, tenant.tenant);
  if (!existingTask.ok) return existingTask;

  const { error: updateError } = await applyTaskTenantScope(
    supabase
      .from("agent_tasks")
      .update(updatePayload(field, normalized.value))
      .eq("id", taskId),
    tenant.tenant,
  );

  if (updateError) {
    return { ok: false, message: `Task update failed: ${updateError.message}` };
  }

  const fieldLabel = humanize(field);
  const eventResult = await insertTaskEvent(supabase, taskId, {
    event_type: field === "status" ? "status_changed" : "property_changed",
    title: `${fieldLabel} changed`,
    body: `${fieldLabel} changed to ${formatValueForBody(normalized.value)}.`,
    metadata: { field, value: normalized.value },
  });

  if (!eventResult.ok) {
    return eventResult;
  }

  revalidateTaskViews(taskId);
  return { ok: true };
}

export async function addTaskEventAction(
  taskId: string,
  input: { eventType: "comment" | "instruction"; body: string },
): Promise<ActionResult> {
  await requireOperator();

  if (!isNonEmptyString(taskId)) {
    return { ok: false, message: "Task id is required." };
  }

  const payload = input as unknown;
  if (!isRecord(payload)) {
    return { ok: false, message: "Task event input is invalid." };
  }

  if (payload.eventType !== "comment" && payload.eventType !== "instruction") {
    return { ok: false, message: "That event type is not supported." };
  }

  if (typeof payload.body !== "string") {
    return { ok: false, message: "Comment or instruction body is required." };
  }

  const body = payload.body.trim();
  if (body.length < 2) {
    return { ok: false, message: "Add at least 2 characters." };
  }
  if (body.length > 4000) {
    return { ok: false, message: "Keep comments and instructions under 4000 characters." };
  }

  if (!isSupabaseAdminConfigured()) {
    return { ok: false, message: "Supabase is not configured." };
  }

  const supabase = getSupabaseAdminClient();
  const tenant = await resolveTenantScope();
  if (!tenant.ok) return tenant;

  const existingTask = await readScopedTaskIdentity(supabase, taskId, tenant.tenant);
  if (!existingTask.ok) return existingTask;

  const title = payload.eventType === "comment" ? "Comment added" : "Instruction added";
  const eventResult = await insertTaskEvent(supabase, taskId, {
    event_type: payload.eventType,
    title,
    body,
    metadata: {},
  });

  if (!eventResult.ok) {
    return eventResult;
  }

  revalidateTaskViews(taskId);
  return { ok: true };
}

export async function toggleAcceptanceCriterionAction(
  taskId: string,
  criterionId: string,
  completed: boolean,
): Promise<ActionResult> {
  await requireOperator();

  if (!isNonEmptyString(taskId)) {
    return { ok: false, message: "Task id is required." };
  }
  if (!isNonEmptyString(criterionId)) {
    return { ok: false, message: "Acceptance criterion id is required." };
  }
  if (typeof completed !== "boolean") {
    return { ok: false, message: "Acceptance criterion completed state must be boolean." };
  }

  if (!isSupabaseAdminConfigured()) {
    return { ok: false, message: "Supabase is not configured." };
  }

  const supabase = getSupabaseAdminClient();
  const tenant = await resolveTenantScope();
  if (!tenant.ok) return tenant;

  const { data, error: readError } = await applyTaskTenantScope(
    supabase
      .from("agent_tasks")
      .select("metadata")
      .eq("id", taskId),
    tenant.tenant,
  ).maybeSingle<TaskMetadataRow>();

  if (readError) {
    return { ok: false, message: `Task lookup failed: ${readError.message}` };
  }

  if (!data) {
    return { ok: false, message: "Task no longer exists." };
  }

  const metadata = asRecord(data.metadata);
  const criteria = Array.isArray(metadata.acceptance_criteria) ? metadata.acceptance_criteria : [];
  let changedLabel: string | null = null;
  let found = false;

  const nextCriteria = criteria.map((item) => {
    if (!isRecord(item) || item.id !== criterionId) {
      return item;
    }

    found = true;
    changedLabel = typeof item.label === "string" && item.label.trim() ? item.label : "Acceptance criterion";
    return { ...item, completed };
  });

  if (!found) {
    return { ok: false, message: "Acceptance criterion no longer exists." };
  }

  const nextMetadata = { ...metadata, acceptance_criteria: nextCriteria };
  const { error: updateError } = await applyTaskTenantScope(
    supabase
      .from("agent_tasks")
      .update({ metadata: nextMetadata })
      .eq("id", taskId),
    tenant.tenant,
  );

  if (updateError) {
    return { ok: false, message: `Acceptance criterion update failed: ${updateError.message}` };
  }

  const eventResult = await insertTaskEvent(supabase, taskId, {
    event_type: "property_changed",
    title: "Acceptance criterion updated",
    body: `${changedLabel ?? "Acceptance criterion"} marked ${completed ? "complete" : "incomplete"}.`,
    metadata: { criterion_id: criterionId, completed },
  });

  if (!eventResult.ok) {
    return eventResult;
  }

  revalidateTaskViews(taskId);
  return { ok: true };
}

async function resolveTenantScope(): Promise<TenantScopeResult> {
  try {
    return { ok: true, tenant: await getCurrentAgentTaskTenantFields() };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "No active workspace is available.",
    };
  }
}

function applyTaskTenantScope<Query>(query: Query, tenant: AgentTaskTenantFields): Query {
  const scoped = query as {
    eq(column: string, value: string): { eq(column: string, value: string): Query };
  };
  return scoped.eq("org_id", tenant.org_id).eq("workspace_id", tenant.workspace_id);
}

async function readScopedTaskIdentity(
  supabase: ReturnType<typeof getSupabaseAdminClient>,
  taskId: string,
  tenant: AgentTaskTenantFields,
): Promise<ActionResult> {
  const { data, error } = await applyTaskTenantScope(
    supabase
      .from("agent_tasks")
      .select("id")
      .eq("id", taskId),
    tenant,
  ).maybeSingle<TaskIdentityRow>();

  if (error) {
    return { ok: false, message: `Task lookup failed: ${error.message}` };
  }

  if (!data) {
    return { ok: false, message: "Task no longer exists." };
  }

  return { ok: true };
}

function normalizeFieldValue(field: EditableField, value: unknown): NormalizedFieldValue {
  if (value !== null && typeof value !== "string") {
    return { ok: false, message: `${humanize(field)} must be a string or empty.` };
  }

  const normalizedValue = value === null ? null : value.trim();

  if (field === "objective" && (!normalizedValue || normalizedValue.length < 3)) {
    return { ok: false, message: "Objective must be at least 3 characters." };
  }

  if (isRequiredTextField(field) && !normalizedValue) {
    return { ok: false, message: `${humanize(field)} cannot be empty.` };
  }

  if (field === "status" && normalizedValue !== null && !VALID_STATUSES.has(normalizedValue)) {
    return { ok: false, message: "That status is not allowed." };
  }

  if (field === "priority" && normalizedValue !== null && !VALID_PRIORITIES.has(normalizedValue)) {
    return { ok: false, message: "That priority is not allowed." };
  }

  if (field === "driver_kind" && normalizedValue !== null && !VALID_DRIVER_KINDS.has(normalizedValue)) {
    return { ok: false, message: "That driver kind is not allowed." };
  }

  if ((field === "due_at" || field === "scheduled_for") && normalizedValue) {
    const parsed = new Date(normalizedValue);
    if (Number.isNaN(parsed.getTime())) {
      return { ok: false, message: `${humanize(field)} must be a valid date.` };
    }
    return { ok: true, value: parsed.toISOString() };
  }

  return { ok: true, value: normalizedValue || null };
}

function updatePayload(field: EditableField, value: string | null): AgentTaskUpdate {
  switch (field) {
    case "objective":
      return { objective: value ?? "" };
    case "description":
      return { description: value };
    case "status":
      return { status: value as AgentTaskStatus };
    case "priority":
      return { priority: value as AgentTaskPriority };
    case "owner_label":
      return { owner_label: value ?? "" };
    case "driver_kind":
      return { driver_kind: value ?? "" };
    case "driver_label":
      return { driver_label: value ?? "" };
    case "approver_label":
      return { approver_label: value ?? "" };
    case "due_at":
      return { due_at: value };
    case "scheduled_for":
      return { scheduled_for: value };
    case "task_type":
      return { task_type: value ?? "" };
    case "campaign_id":
      return { campaign_id: value };
  }
}

async function insertTaskEvent(
  supabase: ReturnType<typeof getSupabaseAdminClient>,
  taskId: string,
  event: {
    event_type: string;
    title: string;
    body: string;
    metadata: Json;
  },
): Promise<ActionResult> {
  const { error } = await supabase.from("agent_task_events").insert({
    task_id: taskId,
    actor_kind: "human",
    actor_label: getOperatorActor(),
    event_type: event.event_type,
    title: event.title,
    body: event.body,
    metadata: event.metadata,
  });

  if (error) {
    return { ok: false, message: `Task event insert failed: ${error.message}` };
  }

  return { ok: true };
}

function revalidateTaskViews(taskId: string) {
  revalidatePath(`/agent-operations/tasks/${taskId}`);
  revalidatePath("/agent-operations");
  revalidatePath("/board");
  revalidatePath("/");
}

function isEditableField(field: unknown): field is EditableField {
  return typeof field === "string" && (EDITABLE_FIELDS as readonly string[]).includes(field);
}

function isRequiredTextField(field: EditableField) {
  return (
    field === "objective" ||
    field === "status" ||
    field === "priority" ||
    field === "owner_label" ||
    field === "driver_kind" ||
    field === "driver_label" ||
    field === "approver_label" ||
    field === "task_type"
  );
}

function humanize(value: string) {
  return value
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatValueForBody(value: string | null) {
  return value ? value : "empty";
}

function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
