import type { OpportunityCandidate } from "@/domain";

import { registerSignalSource, type SignalDetectContext, type SignalSourceConnector } from "../registry";

// ---------------------------------------------------------------------------
// Metered `signal_source` connector (BSR-372). This is the reference consumer of
// the cost-governance path: a PAID third-party data vendor. Read-only — it derives
// permit-backed opportunity candidates deterministically from its per-workspace
// config (the municipalities to watch) and makes NO write. A production build
// swaps detect() for a real permit/property API (BSR-368 enrichment); the shape
// stays identical.
//
// Cost model: each watched municipality is one billable lookup. The detection
// orchestrator authorises the run against the workspace spend cap and records the
// units it actually scanned — see estimateBillableUnits + src/lib/connectors/metering.ts.
// ---------------------------------------------------------------------------

function readMunicipalities(config: Record<string, unknown>): string[] {
  const raw = config.municipalities ?? config.locations;
  if (!Array.isArray(raw)) return [];
  return raw.filter((v): v is string => typeof v === "string" && v.trim().length > 0).map((v) => v.trim());
}

/**
 * How many billable lookups a scan of this config will make. Used up-front to
 * price the run for the cap check, and again after to record actual usage. One
 * paid lookup per watched municipality.
 */
export function estimateBillableUnits(config: Record<string, unknown>): number {
  return readMunicipalities(config).length;
}

export function detectPermitOpportunities(ctx: Pick<SignalDetectContext, "config">): OpportunityCandidate[] {
  return readMunicipalities(ctx.config).map((municipality) => ({
    kind: "permit_filed",
    subjectType: "geo",
    subjectId: `permit:${municipality.toLowerCase()}`,
    title: `New permit activity — ${municipality}`,
    summary:
      `Paid permit records flagged fresh renovation/restoration filings in ${municipality}. Review nearby ` +
      `accounts for a proactive, approval-gated outreach campaign.`,
    confidence: 65,
    urgency: "medium",
    evidence: {
      source: "permit-data (metered stub connector)",
      municipality,
      note: "Stub — replace detect() with a real permit/property API (BSR-368) in production.",
    },
    recommendedAction: "Review permit-adjacent accounts for a renovation outreach campaign",
    recommendedCampaignType: "renovation_outreach",
  }));
}

export const permitDataConnector: SignalSourceConnector = {
  key: "permit-data",
  detect: (ctx) => detectPermitOpportunities(ctx),
  estimateUnits: (config) => estimateBillableUnits(config),
};

registerSignalSource(permitDataConnector);
