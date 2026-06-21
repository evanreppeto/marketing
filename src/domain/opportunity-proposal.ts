import { type OpportunityCandidate } from "./opportunity-detection";

export type ProposalParseResult =
  | { ok: true; candidate: OpportunityCandidate }
  | { ok: false; error: string };

const URGENCIES = new Set(["low", "medium", "high"]);
function str(v: unknown): string { return typeof v === "string" ? v.trim() : ""; }

/** Validate an Arc opportunity proposal (snake_case tool args) into an OpportunityCandidate. Pure. */
export function parseOpportunityProposal(raw: unknown): ProposalParseResult {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const kind = str(r.kind);
  const subjectType = str(r.subject_type ?? r.subjectType);
  const subjectId = str(r.subject_id ?? r.subjectId);
  const title = str(r.title);
  const summary = str(r.summary);
  if (!kind || !subjectType || !subjectId || !title || !summary) {
    return { ok: false, error: "kind, subject_type, subject_id, title, and summary are required." };
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
