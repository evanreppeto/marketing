import type { OpportunityCandidate } from "@/domain";

import { registerSignalSource, type SignalDetectContext, type SignalSourceConnector } from "../registry";

// ---------------------------------------------------------------------------
// Stub `signal_source` connector proving the registry (BSR-363). Read-only: it
// derives opportunity candidates deterministically from its per-workspace config
// (the locations to watch) and makes NO external call and NO write. A production
// build would swap detect() for a real weather API; the shape stays identical.
//
// It emits `weather_event` candidates with a stable subjectId per location, so
// upsertOpportunities' open-status dedup keeps re-scans from flooding the inbox.
// ---------------------------------------------------------------------------

function readLocations(config: Record<string, unknown>): string[] {
  const raw = config.locations;
  if (!Array.isArray(raw)) return [];
  return raw.filter((v): v is string => typeof v === "string" && v.trim().length > 0).map((v) => v.trim());
}

export function detectWeatherOpportunities(ctx: Pick<SignalDetectContext, "config">): OpportunityCandidate[] {
  return readLocations(ctx.config).map((location) => ({
    kind: "weather_event",
    subjectType: "geo",
    subjectId: `weather:${location.toLowerCase()}`,
    title: `Severe-weather watch — ${location}`,
    summary:
      `A storm signal was flagged for ${location}. Review nearby accounts for a proactive, ` +
      `approval-gated storm-response campaign.`,
    confidence: 60,
    urgency: "medium",
    evidence: {
      source: "weather-signals (stub connector)",
      location,
      note: "Stub — replace detect() with a real weather API in production.",
    },
    recommendedAction: "Review affected accounts for a storm-response campaign",
    recommendedCampaignType: "storm_response",
  }));
}

export const weatherSignalConnector: SignalSourceConnector = {
  key: "weather-signals",
  detect: (ctx) => detectWeatherOpportunities(ctx),
};

registerSignalSource(weatherSignalConnector);
