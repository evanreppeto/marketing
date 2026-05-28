import { z } from "zod";

import { EventSubjectTypeSchema } from "./events";

export const INTEGRITY_SEVERITIES = ["info", "warning", "blocking"] as const;
export const IntegritySeveritySchema = z.enum(INTEGRITY_SEVERITIES);
export type IntegritySeverity = z.infer<typeof IntegritySeveritySchema>;

export const IntegrityFindingRowSchema = z.object({
  id: z.string().uuid(),
  rule_key: z.string().min(1),
  subject_type: EventSubjectTypeSchema,
  subject_id: z.string().uuid(),
  severity: IntegritySeveritySchema,
  detail: z.record(z.string(), z.unknown()),
  detected_at: z.string().datetime({ offset: true }),
  resolved_at: z.string().datetime({ offset: true }).nullable(),
  created_at: z.string().datetime({ offset: true }),
  updated_at: z.string().datetime({ offset: true }),
});

export const IntegrityFindingSchema = IntegrityFindingRowSchema.transform((row) => ({
  id: row.id,
  ruleKey: row.rule_key,
  subjectType: row.subject_type,
  subjectId: row.subject_id,
  severity: row.severity,
  detail: row.detail,
  detectedAt: row.detected_at,
  resolvedAt: row.resolved_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
}));

export type IntegrityFindingRow = z.infer<typeof IntegrityFindingRowSchema>;
export type IntegrityFinding = z.infer<typeof IntegrityFindingSchema>;
