import { z } from "zod";

import { INTERNAL_UNASSIGNED_PERSONA, OFFICIAL_PERSONA_MAPPINGS } from "./personas";

const PERSONA_VALUES = [...OFFICIAL_PERSONA_MAPPINGS, INTERNAL_UNASSIGNED_PERSONA] as [string, ...string[]];

export const JOB_STATUSES = ["pending", "scheduled", "in_progress", "completed", "canceled"] as const;
export const JobStatusSchema = z.enum(JOB_STATUSES);
export type JobStatus = z.infer<typeof JobStatusSchema>;

export const JobRowSchema = z.object({
  id: z.string().uuid(),
  lead_id: z.string().uuid().nullable(),
  company_id: z.string().uuid().nullable(),
  contact_id: z.string().uuid().nullable(),
  property_id: z.string().uuid().nullable(),
  persona: z.enum(PERSONA_VALUES),
  status: JobStatusSchema,
  job_number: z.string().nullable(),
  scheduled_at: z.string().datetime({ offset: true }).nullable(),
  completed_at: z.string().datetime({ offset: true }).nullable(),
  estimated_revenue_cents: z.number().int().nullable(),
  metadata: z.record(z.string(), z.unknown()),
  created_at: z.string().datetime({ offset: true }),
  updated_at: z.string().datetime({ offset: true }),
});

export const JobSchema = JobRowSchema.transform((row) => ({
  id: row.id,
  leadId: row.lead_id,
  companyId: row.company_id,
  contactId: row.contact_id,
  propertyId: row.property_id,
  persona: row.persona,
  status: row.status,
  jobNumber: row.job_number,
  scheduledAt: row.scheduled_at,
  completedAt: row.completed_at,
  estimatedRevenueCents: row.estimated_revenue_cents,
  metadata: row.metadata,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
}));

export type JobRow = z.infer<typeof JobRowSchema>;
export type Job = z.infer<typeof JobSchema>;
