import { type SupabaseClient } from "@supabase/supabase-js";

import { type LeadIngestionResult, type ParsedLeadIngestionInput } from "../../domain";
import { type PersistedLeadIngestion } from "../lead-ingestion/persistence";

type AcceptedLeadIngestionResult = Extract<LeadIngestionResult, { ok: true }>;

type PersistPersonaIntelligenceInput = {
  input: ParsedLeadIngestionInput;
  result: AcceptedLeadIngestionResult;
  persisted: PersistedLeadIngestion;
  supabase: SupabaseClient;
  /**
   * The owning workspace. Required — and the reason is nastier than it looks.
   *
   * persona_snapshots / engagement_events / next_best_actions are `org_id NOT
   * NULL`, but they also carry `default default_organization_id()`, which is
   * hardcoded to the 'big-shoulders-restoration' slug. So omitting org_id does
   * NOT fail and does NOT write an unscoped row — it silently writes the row into
   * BSR's workspace. That was invisible while lead ingest was single-tenant
   * (everything was BSR anyway); the moment ingest resolves a real per-workspace
   * org, a tenant's lead would persist to their org while its persona snapshot,
   * engagement events and next-best-action landed in BSR's. Passing org_id
   * explicitly is what stops that.
   */
  orgId: string;
};

type InsertResult = {
  id: string;
};

export type PersistedPersonaIntelligence = {
  personaSnapshotId: string;
  engagementEventIds: string[];
  nextBestActionId: string;
};

export async function persistPersonaIntelligenceForLead({
  input,
  result,
  persisted,
  supabase,
  orgId,
}: PersistPersonaIntelligenceInput): Promise<PersistedPersonaIntelligence> {
  const profile = buildProfile(input, result);
  const personaSnapshotId = await insertAndReturnId(supabase, "persona_snapshots", {
    org_id: orgId,
    persona: result.persona,
    company_id: persisted.companyId,
    contact_id: persisted.contactId,
    property_id: persisted.propertyId,
    lead_id: persisted.leadId,
    relationship_stage: profile.relationshipStage,
    value_tier: profile.valueTier,
    dominant_loss_pattern: profile.dominantLossPattern,
    preferred_channel: profile.preferredChannel,
    message_posture: profile.messagePosture,
    recommended_offer: profile.recommendedOffer,
    next_best_action: profile.nextBestAction,
    confidence_score: profile.confidenceScore,
    risk_flags: profile.riskFlags,
    source_events: profile.sourceEvents,
    reasoning_payload: {
      routing: result.routing,
      classification: result.classification.classification,
      matched_target_keywords: result.classification.matchedTargetKeywords,
      matched_non_target_keywords: result.classification.matchedNonTargetKeywords,
      lead_score: result.scores.leadScore,
      partner_score: result.scores.partnerScore,
    },
    audit_payload: {
      mode: "ingest_auto_generated",
      generated_at: result.scores.calculatedAt,
      source: input.source,
    },
  });

  const engagementEventIds = await insertManyAndReturnIds(supabase, "engagement_events", [
    {
      org_id: orgId,
      company_id: persisted.companyId,
      contact_id: persisted.contactId,
      property_id: persisted.propertyId,
      lead_id: persisted.leadId,
      event_type: "lead_received",
      channel: input.source,
      occurred_at: result.scores.calculatedAt,
      summary: input.lossSummary ?? input.lossSignals.join(", "),
      direction: "inbound",
      metadata: {
        external_lead_id: input.externalLeadId ?? null,
        loss_signals: input.lossSignals,
      },
      reasoning_payload: {},
    },
    {
      org_id: orgId,
      company_id: persisted.companyId,
      contact_id: persisted.contactId,
      property_id: persisted.propertyId,
      lead_id: persisted.leadId,
      event_type: "loss_classified",
      channel: "system",
      occurred_at: result.scores.calculatedAt,
      summary: `${result.classification.classification} routed as ${result.routing}.`,
      direction: "internal",
      metadata: {
        matched_target_keywords: result.classification.matchedTargetKeywords,
        matched_non_target_keywords: result.classification.matchedNonTargetKeywords,
      },
      reasoning_payload: {
        routing_recommendation: result.classification.routingRecommendation,
      },
    },
    {
      org_id: orgId,
      company_id: persisted.companyId,
      contact_id: persisted.contactId,
      property_id: persisted.propertyId,
      lead_id: persisted.leadId,
      event_type: "persona_snapshot_created",
      channel: "system",
      occurred_at: result.scores.calculatedAt,
      summary: profile.nextBestAction,
      direction: "internal",
      metadata: {
        persona_snapshot_id: personaSnapshotId,
      },
      reasoning_payload: {
        confidence_score: profile.confidenceScore,
        risk_flags: profile.riskFlags,
      },
    },
  ]);

  const nextBestActionId = await insertAndReturnId(supabase, "next_best_actions", {
    org_id: orgId,
    persona_snapshot_id: personaSnapshotId,
    company_id: persisted.companyId,
    contact_id: persisted.contactId,
    property_id: persisted.propertyId,
    lead_id: persisted.leadId,
    title: profile.nextBestAction,
    action_type: profile.actionType,
    status: "open",
    priority: profile.confidenceScore,
    approval_required: profile.approvalRequired,
    recommendation: profile.recommendedOffer,
    reason: profile.actionReason,
    reasoning_payload: {
      message_posture: profile.messagePosture,
      preferred_channel: profile.preferredChannel,
      routing: result.routing,
    },
    audit_payload: {
      mode: "ingest_auto_generated",
      generated_at: result.scores.calculatedAt,
    },
  });

  return {
    personaSnapshotId,
    engagementEventIds,
    nextBestActionId,
  };
}

function buildProfile(input: ParsedLeadIngestionInput, result: AcceptedLeadIngestionResult) {
  const confidenceScore = Math.max(result.scores.leadScore, result.scores.partnerScore);
  const targetKeywords = result.classification.matchedTargetKeywords;
  const nonTargetKeywords = result.classification.matchedNonTargetKeywords;
  const dominantLossPattern = targetKeywords[0] ?? nonTargetKeywords[0] ?? "needs_operator_review";
  const isPartner = result.persona.includes("_partner") || result.persona.includes("_agent");
  const isArchived = result.routing === "archived";

  if (isArchived) {
    return {
      relationshipStage: "scope_review",
      valueTier: "low",
      dominantLossPattern,
      preferredChannel: "internal_review",
      messagePosture: "do_not_generate_campaign_until_water_or_restoration_scope_is_confirmed",
      recommendedOffer: "No campaign offer until restoration fit is verified",
      nextBestAction: "Archive or review out-of-scope submission",
      actionType: "scope_review",
      actionReason: "The intake signal matched a non-target or exterior-only loss without a restoration trigger.",
      approvalRequired: false,
      confidenceScore,
      riskFlags: ["out_of_scope_loss_signal", "campaign_generation_blocked"],
      sourceEvents: [
        {
          type: "lead_received",
          source: input.source,
          signals: input.lossSignals,
        },
      ],
    };
  }

  if (isPartner) {
    return {
      relationshipStage: "referral_enablement",
      valueTier: confidenceScore >= 70 ? "high" : "medium",
      dominantLossPattern,
      preferredChannel: "email_then_phone",
      messagePosture: "coverage_neutral_partner_handoff",
      recommendedOffer: "Coverage-neutral client handoff kit",
      nextBestAction: "Send partner handoff packet after approval",
      actionType: "partner_enablement",
      actionReason: "The lead carries partner/referral context and should become a repeatable campaign signal.",
      approvalRequired: true,
      confidenceScore,
      riskFlags: ["coverage_neutral_language_required", "human_approval_required"],
      sourceEvents: [
        {
          type: "lead_received",
          source: input.source,
          signals: input.lossSignals,
        },
      ],
    };
  }

  return {
    relationshipStage: result.routing === "elevated" ? "urgent_decision" : "needs_review",
    valueTier: confidenceScore >= 70 ? "high" : "medium",
    dominantLossPattern,
    preferredChannel: "phone_then_sms",
    messagePosture: "fast_reassurance_documentation_first",
    recommendedOffer: "15 minute mitigation call and photo upload",
    nextBestAction: "Call now and queue approval-safe follow-up",
    actionType: "emergency_follow_up",
    actionReason: "The lead has a restoration signal that benefits from immediate human response and approved follow-up.",
    approvalRequired: true,
    confidenceScore,
    riskFlags: ["coverage_neutral_language_required", "human_approval_required"],
    sourceEvents: [
      {
        type: "lead_received",
        source: input.source,
        signals: input.lossSignals,
      },
    ],
  };
}

async function insertAndReturnId(
  supabase: SupabaseClient,
  table: "persona_snapshots" | "next_best_actions",
  values: Record<string, unknown>,
) {
  const { data, error } = await supabase.from(table).insert(values).select("id").single<InsertResult>();

  if (error) {
    throw new Error(`Failed to persist ${table}: ${error.message}`);
  }

  if (!data?.id) {
    throw new Error(`Failed to persist ${table}: insert did not return an id.`);
  }

  return data.id;
}

async function insertManyAndReturnIds(
  supabase: SupabaseClient,
  table: "engagement_events",
  values: Array<Record<string, unknown>>,
) {
  const { data, error } = await supabase.from(table).insert(values).select("id").returns<InsertResult[]>();

  if (error) {
    throw new Error(`Failed to persist ${table}: ${error.message}`);
  }

  if (!data?.length) {
    throw new Error(`Failed to persist ${table}: insert did not return ids.`);
  }

  return data.map((row) => row.id);
}
