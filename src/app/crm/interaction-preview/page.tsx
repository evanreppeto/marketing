/**
 * THROWAWAY preview page — renders the new CRM interaction panels with mock
 * data so the UI can be eyeballed without applying the migration / Supabase.
 * Not part of the feature. Delete this folder before merging.
 */
import { RecordTimeline } from "../_components/record-interactions/timeline";
import { NotesPanel } from "../_components/record-interactions/notes-panel";
import { TasksPanel } from "../_components/record-interactions/tasks-panel";
import { type NoteEntry, type TaskEntry, type TimelineEntry } from "@/lib/interactions/read-model";

const ENTITY_ID = "11111111-1111-1111-1111-111111111111";

const notes: NoteEntry[] = [
  {
    id: "n1",
    body: "Spoke with the operations manager. They are evaluating a new campaign partnership and want a walkthrough next week. Flag for follow-up.",
    isPinned: true,
    isInternal: false,
    actorKind: "human",
    actorLabel: "evan.reppeto5928@gmail.com",
    createdAt: "2026-06-11T15:20:00.000Z",
  },
  {
    id: "n2",
    body: "Auto-research: this company matches three recent high-fit accounts and has a strong referral profile. Good fit for a partnership angle.",
    isPinned: false,
    isInternal: true,
    actorKind: "agent",
    actorLabel: "Arc",
    createdAt: "2026-06-10T09:05:00.000Z",
  },
];

const tasks: TaskEntry[] = [
  {
    id: "t1",
    title: "Send the partnership one-pager",
    description: "Use the approved proof points from the latest customer story.",
    dueAt: "2026-06-09T17:00:00.000Z",
    priority: "high",
    status: "open",
    urgency: "overdue",
    assigneeLabel: "evan.reppeto5928@gmail.com",
    actorKind: "agent",
    actorLabel: "Arc",
    createdAt: "2026-06-08T12:00:00.000Z",
  },
  {
    id: "t2",
    title: "Confirm walkthrough time with facilities manager",
    description: null,
    dueAt: "2026-06-12T20:00:00.000Z",
    priority: "normal",
    status: "open",
    urgency: "due_today",
    assigneeLabel: null,
    actorKind: "human",
    actorLabel: "evan.reppeto5928@gmail.com",
    createdAt: "2026-06-11T15:25:00.000Z",
  },
  {
    id: "t3",
    title: "Add asset details to the CRM record",
    description: null,
    dueAt: "2026-06-18T17:00:00.000Z",
    priority: "low",
    status: "open",
    urgency: "upcoming",
    assigneeLabel: null,
    actorKind: "human",
    actorLabel: "evan.reppeto5928@gmail.com",
    createdAt: "2026-06-11T15:26:00.000Z",
  },
];

const timeline: TimelineEntry[] = [
  {
    id: "a1",
    activityType: "note_added",
    tone: "blue",
    summary: "Note added",
    detail: "Spoke with the operations manager about a possible partnership.",
    actorKind: "human",
    actorLabel: "evan.reppeto5928@gmail.com",
    occurredAt: "2026-06-11T15:20:00.000Z",
  },
  {
    id: "a2",
    activityType: "task_created",
    tone: "amber",
    summary: "Task created: Confirm walkthrough time with facilities manager",
    detail: null,
    actorKind: "human",
    actorLabel: "evan.reppeto5928@gmail.com",
    occurredAt: "2026-06-11T15:25:00.000Z",
  },
  {
    id: "a3",
    activityType: "call_logged",
    tone: "blue",
    summary: "Logged a call with the facilities manager (12 min)",
    detail: "Discussed scope; they asked for relevant customer references.",
    actorKind: "human",
    actorLabel: "evan.reppeto5928@gmail.com",
    occurredAt: "2026-06-11T15:10:00.000Z",
  },
  {
    id: "a4",
    activityType: "ai_recommendation",
    tone: "amber",
    summary: "Arc recommended a partnership message angle",
    detail: "Based on lookalike fit with recent high-value accounts.",
    actorKind: "agent",
    actorLabel: "Arc",
    occurredAt: "2026-06-10T09:05:00.000Z",
  },
  {
    id: "a5",
    activityType: "record_created",
    tone: "green",
    summary: "Contact record created",
    detail: null,
    actorKind: "system",
    actorLabel: "System",
    occurredAt: "2026-06-09T08:00:00.000Z",
  },
];

export default function InteractionPreviewPage() {
  return (
    <div className="mx-auto min-h-screen max-w-[480px] space-y-5 bg-[var(--canvas)] p-6">
      <div>
        <div className="signal-eyebrow">Preview · mock data</div>
        <h1 className="mt-1 text-2xl font-bold tracking-[-0.04em] text-[var(--text-primary)]">
          CRM interaction panels
        </h1>
        <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
          These three panels attach to every CRM record (contact / company / asset / lead / project /
          outcome). On a real record they render live data; here they show sample content.
        </p>
      </div>
      <TasksPanel entityType="contact" entityId={ENTITY_ID} tasks={tasks} />
      <NotesPanel entityType="contact" entityId={ENTITY_ID} notes={notes} />
      <RecordTimeline entries={timeline} />
    </div>
  );
}
