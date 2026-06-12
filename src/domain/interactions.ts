/**
 * Pure logic for the CRM interaction layer (notes, tasks, activity timeline).
 * No I/O. Validation + normalization + derivations only; persistence and
 * org-scoping live in src/lib/interactions/.
 */

export const CRM_ENTITY_TYPES = [
  "company",
  "contact",
  "property",
  "lead",
  "job",
  "outcome",
  "campaign",
] as const;
export type CrmEntityType = (typeof CRM_ENTITY_TYPES)[number];

export const ACTOR_KINDS = ["human", "agent", "system"] as const;
export type ActorKind = (typeof ACTOR_KINDS)[number];

export const TASK_PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const TASK_STATUSES = ["open", "in_progress", "completed", "canceled"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const CRM_ACTIVITY_TYPES = [
  "note_added",
  "status_changed",
  "call_logged",
  "email_logged",
  "sms_logged",
  "meeting_logged",
  "task_created",
  "task_completed",
  "record_created",
  "record_updated",
  "ai_recommendation",
  "approval_requested",
  "approval_decided",
  "converted",
  "file_added",
] as const;
export type CrmActivityType = (typeof CRM_ACTIVITY_TYPES)[number];

export type TaskUrgency = "overdue" | "due_today" | "upcoming" | "none";

export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string };

export type NoteInput = {
  entityType: CrmEntityType;
  entityId: string;
  body: string;
  isPinned: boolean;
  isInternal: boolean;
  authorKind: ActorKind;
  authorName?: string;
};

export type TaskInput = {
  entityType: CrmEntityType | null;
  entityId: string | null;
  title: string;
  description?: string;
  dueAt?: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  assigneeKind?: ActorKind | null;
  assigneeName?: string;
  authorKind: ActorKind;
  authorName?: string;
};

export type ActivityInput = {
  entityType: CrmEntityType;
  entityId: string;
  activityType: CrmActivityType;
  summary: string;
  detail?: string;
  actorKind: ActorKind;
  actorName?: string;
  metadata?: Record<string, unknown>;
};

function trimmed(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isEntityType(value: unknown): value is CrmEntityType {
  return typeof value === "string" && (CRM_ENTITY_TYPES as readonly string[]).includes(value);
}

function isActorKind(value: unknown): value is ActorKind {
  return typeof value === "string" && (ACTOR_KINDS as readonly string[]).includes(value);
}

export function parseNoteInput(raw: {
  entityType: unknown;
  entityId: unknown;
  body: unknown;
  authorKind: unknown;
  authorName?: unknown;
  isPinned?: unknown;
  isInternal?: unknown;
}): ParseResult<NoteInput> {
  if (!isEntityType(raw.entityType)) return { ok: false, error: "Unknown record type." };
  const entityId = trimmed(raw.entityId);
  if (!entityId) return { ok: false, error: "A note needs a record to attach to." };
  const body = trimmed(raw.body);
  if (!body) return { ok: false, error: "A note needs some text." };
  if (!isActorKind(raw.authorKind)) return { ok: false, error: "Unknown author." };
  const authorName = trimmed(raw.authorName);
  return {
    ok: true,
    value: {
      entityType: raw.entityType,
      entityId,
      body,
      isPinned: raw.isPinned === true,
      isInternal: raw.isInternal === true,
      authorKind: raw.authorKind,
      ...(authorName ? { authorName } : {}),
    },
  };
}

export function parseTaskInput(raw: {
  entityType?: unknown;
  entityId?: unknown;
  title: unknown;
  description?: unknown;
  dueAt?: unknown;
  priority?: unknown;
  status?: unknown;
  assigneeKind?: unknown;
  assigneeName?: unknown;
  authorKind: unknown;
  authorName?: unknown;
}): ParseResult<TaskInput> {
  const title = trimmed(raw.title);
  if (!title) return { ok: false, error: "A task needs a title." };
  if (!isActorKind(raw.authorKind)) return { ok: false, error: "Unknown author." };

  const hasType = raw.entityType !== undefined && raw.entityType !== null && raw.entityType !== "";
  const hasId = raw.entityId !== undefined && raw.entityId !== null && raw.entityId !== "";
  if (hasType !== hasId) {
    return { ok: false, error: "A linked task needs both a record type and id." };
  }
  if (hasType && !isEntityType(raw.entityType)) return { ok: false, error: "Unknown record type." };

  const priority = raw.priority === undefined || raw.priority === "" ? "normal" : raw.priority;
  if (!(TASK_PRIORITIES as readonly string[]).includes(priority as string)) {
    return { ok: false, error: "Unknown task priority." };
  }
  const status = raw.status === undefined || raw.status === "" ? "open" : raw.status;
  if (!(TASK_STATUSES as readonly string[]).includes(status as string)) {
    return { ok: false, error: "Unknown task status." };
  }
  if (raw.assigneeKind !== undefined && raw.assigneeKind !== null && !isActorKind(raw.assigneeKind)) {
    return { ok: false, error: "Unknown assignee." };
  }

  const description = trimmed(raw.description);
  const dueAt = trimmed(raw.dueAt);
  const assigneeName = trimmed(raw.assigneeName);
  const authorName = trimmed(raw.authorName);

  return {
    ok: true,
    value: {
      entityType: hasType ? (raw.entityType as CrmEntityType) : null,
      entityId: hasId ? trimmed(raw.entityId) : null,
      title,
      ...(description ? { description } : {}),
      dueAt: dueAt ? dueAt : null,
      priority: priority as TaskPriority,
      status: status as TaskStatus,
      assigneeKind: isActorKind(raw.assigneeKind) ? raw.assigneeKind : null,
      ...(assigneeName ? { assigneeName } : {}),
      authorKind: raw.authorKind,
      ...(authorName ? { authorName } : {}),
    },
  };
}

export function parseActivityInput(raw: {
  entityType: unknown;
  entityId: unknown;
  activityType: unknown;
  summary: unknown;
  detail?: unknown;
  actorKind: unknown;
  actorName?: unknown;
  metadata?: unknown;
}): ParseResult<ActivityInput> {
  if (!isEntityType(raw.entityType)) return { ok: false, error: "Unknown record type." };
  const entityId = trimmed(raw.entityId);
  if (!entityId) return { ok: false, error: "An activity needs a record to attach to." };
  if (
    typeof raw.activityType !== "string" ||
    !(CRM_ACTIVITY_TYPES as readonly string[]).includes(raw.activityType)
  ) {
    return { ok: false, error: "Unknown activity type." };
  }
  const summary = trimmed(raw.summary);
  if (!summary) return { ok: false, error: "An activity needs a summary." };
  if (!isActorKind(raw.actorKind)) return { ok: false, error: "Unknown actor." };

  const detail = trimmed(raw.detail);
  const actorName = trimmed(raw.actorName);
  const metadata =
    raw.metadata && typeof raw.metadata === "object" && !Array.isArray(raw.metadata)
      ? (raw.metadata as Record<string, unknown>)
      : undefined;

  return {
    ok: true,
    value: {
      entityType: raw.entityType,
      entityId,
      activityType: raw.activityType as CrmActivityType,
      summary,
      ...(detail ? { detail } : {}),
      actorKind: raw.actorKind,
      ...(actorName ? { actorName } : {}),
      ...(metadata ? { metadata } : {}),
    },
  };
}

export function deriveTaskUrgency(dueAt: string | null | undefined, now: Date): TaskUrgency {
  if (!dueAt) return "none";
  const due = new Date(dueAt);
  if (Number.isNaN(due.getTime())) return "none";
  const sameUtcDay =
    due.getUTCFullYear() === now.getUTCFullYear() &&
    due.getUTCMonth() === now.getUTCMonth() &&
    due.getUTCDate() === now.getUTCDate();
  if (sameUtcDay) return "due_today";
  return due.getTime() < now.getTime() ? "overdue" : "upcoming";
}

const OBJECT_KEY_TO_ENTITY: Record<string, CrmEntityType> = {
  companies: "company",
  contacts: "contact",
  properties: "property",
  leads: "lead",
  jobs: "job",
  outcomes: "outcome",
};

export function entityTypeFromCrmObjectKey(key: string): CrmEntityType | null {
  return OBJECT_KEY_TO_ENTITY[key] ?? null;
}
