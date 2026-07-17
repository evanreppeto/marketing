/**
 * Pure persona → intelligence profile derivation.
 *
 * From a classified, scored lead this produces the relationship stage, value
 * tier, preferred channel, message posture, recommended offer, next-best-action
 * and risk flags that a persona_snapshot + next_best_action are built from. No
 * I/O — the persistence layer maps a real lead onto PersonaProfileInput and
 * writes the rows.
 *
 * It lived inside src/lib/persona-intelligence/persistence.ts, untested, even
 * though every accepted lead ingest writes three tables off it. This is exactly
 * the "pure, deterministic, heavily unit-tested" logic the domain layer is for,
 * so it moved here with its behaviour preserved verbatim.
 */

export type PersonaProfileInput = {
  /** Where the lead came from (channel/source label), surfaced in sourceEvents. */
  source: string;
  /** Normalized loss signals, carried onto the snapshot's source event. */
  lossSignals: string[];
  /** The resolved persona key (e.g. persona_homeowner_emergency). */
  persona: string;
  /** Routing decision from classification. `archived` = out of restoration scope. */
  routing: "elevated" | "target" | "needs_review" | "archived";
  leadScore: number;
  partnerScore: number;
  matchedTargetKeywords: string[];
  matchedNonTargetKeywords: string[];
};

export type PersonaProfileSourceEvent = {
  type: "lead_received";
  source: string;
  signals: string[];
};

export type PersonaProfile = {
  relationshipStage: string;
  valueTier: "low" | "medium" | "high";
  dominantLossPattern: string;
  preferredChannel: string;
  messagePosture: string;
  recommendedOffer: string;
  nextBestAction: string;
  actionType: string;
  actionReason: string;
  approvalRequired: boolean;
  confidenceScore: number;
  riskFlags: string[];
  sourceEvents: PersonaProfileSourceEvent[];
};

export function buildPersonaProfile(input: PersonaProfileInput): PersonaProfile {
  const confidenceScore = Math.max(input.leadScore, input.partnerScore);
  const targetKeywords = input.matchedTargetKeywords;
  const nonTargetKeywords = input.matchedNonTargetKeywords;
  const dominantLossPattern = targetKeywords[0] ?? nonTargetKeywords[0] ?? "needs_operator_review";
  const isPartner = input.persona.includes("_partner") || input.persona.includes("_agent");
  const isArchived = input.routing === "archived";

  const sourceEvents: PersonaProfileSourceEvent[] = [
    { type: "lead_received", source: input.source, signals: input.lossSignals },
  ];

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
      sourceEvents,
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
      sourceEvents,
    };
  }

  return {
    relationshipStage: input.routing === "elevated" ? "urgent_decision" : "needs_review",
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
    sourceEvents,
  };
}
