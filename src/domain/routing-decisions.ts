import { z } from "zod";

export const ROUTING_DECISION_KINDS = ["mitigation", "review", "out_of_scope", "archived"] as const;
export const RoutingDecisionKindSchema = z.enum(ROUTING_DECISION_KINDS);
export type RoutingDecisionKind = z.infer<typeof RoutingDecisionKindSchema>;

export const RoutingDecisionRowSchema = z.object({
  id: z.string().uuid(),
  lead_id: z.string().uuid(),
  decision: RoutingDecisionKindSchema,
  confidence: z.number().int().min(0).max(100),
  sla_target_minutes: z.number().int().min(0).nullable(),
  decided_by: z.string().min(1),
  decided_at: z.string().datetime({ offset: true }),
  rationale: z.record(z.string(), z.unknown()),
  created_at: z.string().datetime({ offset: true }),
});

export const RoutingDecisionSchema = RoutingDecisionRowSchema.transform((row) => ({
  id: row.id,
  leadId: row.lead_id,
  decision: row.decision,
  confidence: row.confidence,
  slaTargetMinutes: row.sla_target_minutes,
  decidedBy: row.decided_by,
  decidedAt: row.decided_at,
  rationale: row.rationale,
  createdAt: row.created_at,
}));

export type RoutingDecisionRow = z.infer<typeof RoutingDecisionRowSchema>;
export type RoutingDecision = z.infer<typeof RoutingDecisionSchema>;
