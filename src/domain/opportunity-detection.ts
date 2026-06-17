/**
 * Pure detection of "opportunities" from CRM signals. No I/O. v1 source:
 * cold leads — open, unworked leads that have gone quiet — surfaced for human
 * review (never auto-contacted). Deterministic so it stays unit-testable.
 */

export type ColdLeadInput = {
  id: string;
  /** Human label (contact/company name or lead id) for the card. */
  label: string;
  persona: string;
  leadScore: number; // 0–100
  status: string; // lead_status value
  /** ISO timestamp of the lead's most recent activity (latest event, else received_at). */
  lastActivityAt: string;
  hasActiveCampaign: boolean;
};

export type DetectionConfig = { now: string; coldDays?: number };

export type OpportunityCandidate = {
  kind: "crm_inactivity";
  subjectType: "lead";
  subjectId: string;
  title: string;
  summary: string;
  confidence: number; // 0–100
  urgency: "low" | "medium" | "high";
  evidence: { daysCold: number; leadScore: number; persona: string; lastActivityAt: string };
  recommendedAction: string;
  recommendedCampaignType: string;
};

const DEFAULT_COLD_DAYS = 30;
const TERMINAL_STATUSES = new Set(["converted", "lost", "archived"]);
const DAY_MS = 24 * 60 * 60 * 1000;

function daysBetween(fromIso: string, toIso: string): number {
  const from = Date.parse(fromIso);
  const to = Date.parse(toIso);
  if (Number.isNaN(from) || Number.isNaN(to)) return 0;
  return Math.max(0, Math.floor((to - from) / DAY_MS));
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

/** Cold-lead opportunities: open leads with no live campaign, quiet >= coldDays. */
export function detectColdLeadOpportunities(leads: ColdLeadInput[], config: DetectionConfig): OpportunityCandidate[] {
  const coldDays = config.coldDays ?? DEFAULT_COLD_DAYS;
  const out: OpportunityCandidate[] = [];
  for (const lead of leads) {
    if (TERMINAL_STATUSES.has(lead.status)) continue;
    if (lead.hasActiveCampaign) continue;
    const daysCold = daysBetween(lead.lastActivityAt, config.now);
    if (daysCold < coldDays) continue;

    // Confidence: lead quality plus a cold bonus (longer quiet = more worth re-engaging).
    const confidence = clamp(Math.round(lead.leadScore + Math.min(20, daysCold / 7)), 0, 100);
    const urgency: OpportunityCandidate["urgency"] =
      lead.leadScore >= 75 && daysCold >= 45 ? "high" : lead.leadScore >= 50 || daysCold >= 60 ? "medium" : "low";

    out.push({
      kind: "crm_inactivity",
      subjectType: "lead",
      subjectId: lead.id,
      title: `${lead.label} — quiet ${daysCold} days`,
      summary: `Open lead (score ${lead.leadScore}) with no live campaign and no activity in ${daysCold} days.`,
      confidence,
      urgency,
      evidence: { daysCold, leadScore: lead.leadScore, persona: lead.persona, lastActivityAt: lead.lastActivityAt },
      recommendedAction: "Re-engage with a persona-tailored campaign",
      recommendedCampaignType: "re_engagement",
    });
  }
  return out;
}
