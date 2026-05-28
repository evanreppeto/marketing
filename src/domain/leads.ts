import { z } from "zod";

import { INTERNAL_UNASSIGNED_PERSONA, OFFICIAL_PERSONA_MAPPINGS } from "./personas";

const PERSONA_VALUES = [
  ...OFFICIAL_PERSONA_MAPPINGS,
  INTERNAL_UNASSIGNED_PERSONA,
] as [string, ...string[]];

export const LEAD_STATUSES = [
  "new",
  "validated",
  "needs_review",
  "qualified",
  "converted",
  "lost",
  "archived",
] as const;
export const LeadStatusSchema = z.enum(LEAD_STATUSES);
export type LeadStatus = z.infer<typeof LeadStatusSchema>;

export const ROUTING_RECOMMENDATIONS = ["target", "elevated", "downgraded", "isolated", "archived"] as const;
export const RoutingRecommendationSchema = z.enum(ROUTING_RECOMMENDATIONS);
export type RoutingRecommendation = z.infer<typeof RoutingRecommendationSchema>;

export const LeadRowSchema = z.object({
  id: z.string().uuid(),
  company_id: z.string().uuid().nullable(),
  contact_id: z.string().uuid().nullable(),
  property_id: z.string().uuid().nullable(),
  persona: z.enum(PERSONA_VALUES),
  status: LeadStatusSchema,
  routing_recommendation: RoutingRecommendationSchema,
  source: z.string().min(1),
  external_lead_id: z.string().nullable(),
  loss_summary: z.string().nullable(),
  loss_signals: z.array(z.string()),
  matched_target_keywords: z.array(z.string()),
  matched_non_target_keywords: z.array(z.string()),
  lead_score: z.number().int().min(0).max(100),
  received_at: z.string().datetime({ offset: true }),
  metadata: z.record(z.string(), z.unknown()),
  created_at: z.string().datetime({ offset: true }),
  updated_at: z.string().datetime({ offset: true }),
});

export const LeadSchema = LeadRowSchema.transform((row) => ({
  id: row.id,
  companyId: row.company_id,
  contactId: row.contact_id,
  propertyId: row.property_id,
  persona: row.persona,
  status: row.status,
  routingRecommendation: row.routing_recommendation,
  source: row.source,
  externalLeadId: row.external_lead_id,
  lossSummary: row.loss_summary,
  lossSignals: row.loss_signals,
  matchedTargetKeywords: row.matched_target_keywords,
  matchedNonTargetKeywords: row.matched_non_target_keywords,
  leadScore: row.lead_score,
  receivedAt: row.received_at,
  metadata: row.metadata,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
}));

export type LeadRow = z.infer<typeof LeadRowSchema>;
export type Lead = z.infer<typeof LeadSchema>;
