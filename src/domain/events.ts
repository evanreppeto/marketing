import { z } from "zod";

export const EVENT_SUBJECT_TYPES = ["company", "contact", "property", "lead", "job", "outcome"] as const;
export const EventSubjectTypeSchema = z.enum(EVENT_SUBJECT_TYPES);
export type EventSubjectType = z.infer<typeof EventSubjectTypeSchema>;

// Free-form event type strings. Conventions: "<subject>.<verb>" (e.g. "lead.created").
// Listed canonical types here so call sites can reference constants instead of magic strings.
export const EVENT_TYPES = {
  LeadCreated: "lead.created",
  LeadValidated: "lead.validated",
  LeadRouted: "lead.routed",
  LeadContacted: "lead.contacted",
  JobOpened: "job.opened",
  JobCompleted: "job.completed",
  OutcomeRecorded: "outcome.recorded",
} as const;

export const EventRowSchema = z.object({
  id: z.string().uuid(),
  actor: z.string().min(1),
  subject_type: EventSubjectTypeSchema,
  subject_id: z.string().uuid(),
  type: z.string().min(1),
  payload: z.record(z.string(), z.unknown()),
  occurred_at: z.string().datetime({ offset: true }),
  created_at: z.string().datetime({ offset: true }),
});

export const EventSchema = EventRowSchema.transform((row) => ({
  id: row.id,
  actor: row.actor,
  subjectType: row.subject_type,
  subjectId: row.subject_id,
  type: row.type,
  payload: row.payload,
  occurredAt: row.occurred_at,
  createdAt: row.created_at,
}));

export type EventRow = z.infer<typeof EventRowSchema>;
export type Event = z.infer<typeof EventSchema>;
