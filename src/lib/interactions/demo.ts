import { deriveTaskUrgency, type CrmActivityType, type CrmEntityType } from "@/domain";

import { type ActivityTone, type NoteEntry, type TaskEntry, type TimelineEntry } from "./read-model";

/**
 * Read-only demo interactions for the CRM record Activity tab. Used when Supabase
 * isn't configured (local preview / ARC_DEMO_DATA) so a record shows a believable
 * BSR history — timeline, notes, follow-up tasks — instead of an empty state.
 * Everything is display-only; nothing here logs or sends anything.
 *
 * Keyed loosely off the entity so different records don't read identically, and
 * varied by entity type so a lead, a company, and a contact each tell a slightly
 * different story.
 */

const DAY = 86_400_000;

function daysAgo(days: number): string {
  return new Date(Date.now() - days * DAY).toISOString();
}
function daysAhead(days: number): string {
  return new Date(Date.now() + days * DAY).toISOString();
}

// Small deterministic recency shift so two demo records don't share timestamps.
function jitter(entityId: string): number {
  let h = 0;
  for (let i = 0; i < entityId.length; i++) h = (h * 31 + entityId.charCodeAt(i)) & 0xffff;
  return h % 3;
}

const TONE: Record<CrmActivityType, ActivityTone> = {
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

function statusChange(entityType: CrmEntityType): string {
  switch (entityType) {
    case "lead":
      return "Lead promoted New → Qualified.";
    case "company":
      return "Partner tier confirmed — Tier A.";
    case "job":
      return "Job scheduled — crew assigned.";
    case "outcome":
      return "Outcome marked won.";
    default:
      return "Relationship stage moved to Engaged.";
  }
}

function aiInsight(entityType: CrmEntityType): string {
  switch (entityType) {
    case "lead":
      return "Scored the lead 90+ and routed it for fast follow-up.";
    case "company":
      return "Flagged strong referral + co-marketing potential.";
    default:
      return "Classified the persona and drafted a recommended next step.";
  }
}

function entry(
  id: string,
  activityType: CrmActivityType,
  summary: string,
  detail: string | null,
  actorKind: TimelineEntry["actorKind"],
  actorLabel: string,
  occurredAt: string,
): TimelineEntry {
  return { id, activityType, tone: TONE[activityType], summary, detail, actorKind, actorLabel, occurredAt };
}

export function buildDemoTimeline(entityType: CrmEntityType, entityId: string): TimelineEntry[] {
  const j = jitter(entityId);
  // Newest first, matching the live query's occurred_at-desc order.
  return [
    entry(`${entityId}-a1`, "task_created", "Follow-up task created", "Arc queued the next best action for your review.", "agent", "Arc", daysAgo(1 + j)),
    entry(`${entityId}-a2`, "note_added", "Note added", "Wants the work handled before the season turns; insurance claim in progress.", "human", "Robby", daysAgo(3 + j)),
    entry(`${entityId}-a3`, "status_changed", "Status changed", statusChange(entityType), "system", "System", daysAgo(9 + j)),
    entry(`${entityId}-a4`, "email_logged", "Email logged", "Sent the intro + service overview.", "human", "Robby", daysAgo(16 + j)),
    entry(`${entityId}-a5`, "ai_recommendation", "Arc recommendation", aiInsight(entityType), "agent", "Arc", daysAgo(24 + j)),
    entry(`${entityId}-a6`, "record_created", "Record created", "Added to the workspace.", "system", "System", daysAgo(30 + j)),
  ];
}

export function buildDemoNotes(_entityType: CrmEntityType, entityId: string): NoteEntry[] {
  return [
    {
      id: `${entityId}-n1`,
      body: "Fresh damage; wants the job done before the season turns. Insurance claim in progress.",
      isPinned: true,
      isInternal: true,
      actorKind: "human",
      actorLabel: "Robby",
      createdAt: daysAgo(3),
    },
    {
      id: `${entityId}-n2`,
      body: "Left a voicemail and followed up by email. Waiting on the adjuster's visit.",
      isPinned: false,
      isInternal: false,
      actorKind: "human",
      actorLabel: "Robby",
      createdAt: daysAgo(11),
    },
  ];
}

export function buildDemoTasks(_entityType: CrmEntityType, entityId: string, now: Date = new Date()): TaskEntry[] {
  const due1 = daysAhead(2);
  const due2 = daysAhead(5);
  return [
    {
      id: `${entityId}-t1`,
      title: "Schedule the on-site inspection",
      description: "Confirm access and a two-hour window.",
      dueAt: due1,
      priority: "high",
      status: "open",
      urgency: deriveTaskUrgency(due1, now),
      assigneeLabel: "Robby",
      actorKind: "agent",
      actorLabel: "Arc",
      createdAt: daysAgo(3),
    },
    {
      id: `${entityId}-t2`,
      title: "Send the insurance-coordination one-pager",
      description: null,
      dueAt: due2,
      priority: "normal",
      status: "open",
      urgency: deriveTaskUrgency(due2, now),
      assigneeLabel: "Robby",
      actorKind: "human",
      actorLabel: "Robby",
      createdAt: daysAgo(2),
    },
    {
      id: `${entityId}-t3`,
      title: "Send intro + service overview",
      description: null,
      dueAt: null,
      priority: "normal",
      status: "completed",
      urgency: "none",
      assigneeLabel: "Robby",
      actorKind: "human",
      actorLabel: "Robby",
      createdAt: daysAgo(16),
    },
  ];
}
