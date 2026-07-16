import { type OpportunityCandidate } from "./opportunity-detection";
import {
  OPPORTUNITY_KINDS,
  OPPORTUNITY_SUBJECT_TYPES,
  normalizeOpportunityKind,
  normalizeOpportunitySubjectType,
} from "./opportunity-kinds";

export type ProposalParseResult =
  | { ok: true; candidate: OpportunityCandidate }
  | { ok: false; error: string };

const URGENCIES = new Set(["low", "medium", "high"]);
function str(v: unknown): string { return typeof v === "string" ? v.trim() : ""; }

/** Validate an Arc opportunity proposal (snake_case tool args) into an OpportunityCandidate. Pure. */
export function parseOpportunityProposal(raw: unknown): ProposalParseResult {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const rawKind = str(r.kind);
  const rawSubjectType = str(r.subject_type ?? r.subjectType);
  const subjectId = str(r.subject_id ?? r.subjectId);
  const title = str(r.title);
  const summary = str(r.summary);
  if (!rawKind || !rawSubjectType || !subjectId || !title || !summary) {
    return { ok: false, error: "kind, subject_type, subject_id, title, and summary are required." };
  }

  // kind and subject_type are two thirds of the dedup key, so an off-vocabulary
  // value doesn't just mislabel a card — it hides the duplicate it should collide
  // with. Reject rather than coerce: the caller is Arc, the message lists the
  // vocabulary, and a tool error it can read and retry beats a silently mis-filed
  // opportunity. Known synonyms normalize instead, which is also what keeps a
  // briefly-skewed runner (it deploys separately) landing on the right kind.
  const kind = normalizeOpportunityKind(rawKind);
  if (!kind) {
    return { ok: false, error: `Unknown kind "${rawKind}". Use one of: ${OPPORTUNITY_KINDS.join(", ")}.` };
  }
  const subjectType = normalizeOpportunitySubjectType(rawSubjectType);
  if (!subjectType) {
    return {
      ok: false,
      error: `Unknown subject_type "${rawSubjectType}". Use one of: ${OPPORTUNITY_SUBJECT_TYPES.join(", ")}.`,
    };
  }
  const confNum = Number(r.confidence);
  const confidence = Number.isFinite(confNum) ? Math.min(100, Math.max(0, Math.round(confNum))) : 60;
  const u = str(r.urgency).toLowerCase();
  const urgency = (URGENCIES.has(u) ? u : "medium") as OpportunityCandidate["urgency"];
  const evidence = (r.evidence && typeof r.evidence === "object" ? r.evidence : {}) as Record<string, unknown>;
  return {
    ok: true,
    candidate: {
      kind, subjectType, subjectId, title, summary, confidence, urgency, evidence,
      recommendedAction: str(r.recommended_action ?? r.recommendedAction),
      recommendedCampaignType: str(r.recommended_campaign_type ?? r.recommendedCampaignType),
    },
  };
}
