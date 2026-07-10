import {
  detectCompetitorOpportunities,
  mapAdFlightsToSignals,
  type CompetitorAdFlight,
  type OpportunityCandidate,
} from "@/domain";

import { registerSignalSource, type SignalDetectContext, type SignalSourceConnector } from "../registry";

// ---------------------------------------------------------------------------
// Real `competitor-ads` signal_source connector (BSR-367). Read-only: reads a
// competitor's active ad flights from the public ad libraries (Meta Ad Library /
// Google Ads Transparency) for the workspace's market, maps them onto the SAME
// BSR-361 competitor-signal detector, and proposes defensive/contested-market
// `competitor_signal` opportunities (with the competitor's keywords + creative
// intel carried in evidence for a differentiated response). It makes NO write and
// nothing outbound — the orchestrator is the only writer, and only to
// `opportunities`. subjectId is the ad-flight id, so upsertOpportunities'
// open-status dedup keeps re-scans (and Meta/Google overlap) from doubling up.
//
// Live Meta Ad Library / Google Ads Transparency pull is the remaining
// integration; until it lands, flights are read from the connector's own config
// (`config.flights`) — the same injectable seam a live library client drops into.
// Official APIs only (ToS): no scraping.
// ---------------------------------------------------------------------------

export type CompetitorAdSource = {
  listAdFlights(now: string): Promise<CompetitorAdFlight[]>;
};

function isAdFlight(value: unknown): value is CompetitorAdFlight {
  if (!value || typeof value !== "object") return false;
  const f = value as Record<string, unknown>;
  return typeof f.id === "string" && f.id.trim().length > 0 && typeof f.competitorName === "string" && f.competitorName.trim().length > 0;
}

/**
 * Default source until live OAuth/API: competitor flights seeded into the
 * connector's per-workspace config (`config.flights`). Returns [] when none are
 * configured — an un-onboarded connector proposes nothing rather than inventing
 * competitors.
 */
export function configAdSource(config: Record<string, unknown> | null | undefined): CompetitorAdSource {
  return {
    async listAdFlights(): Promise<CompetitorAdFlight[]> {
      const raw = (config ?? {}).flights;
      return Array.isArray(raw) ? raw.filter(isAdFlight) : [];
    },
  };
}

export type CompetitorAdDetectInput = Pick<SignalDetectContext, "config"> & {
  now?: string;
  /** Injected in tests / by a live library client; defaults to the config source. */
  source?: CompetitorAdSource;
};

/**
 * Detect competitor-signal opportunities from recent ad flights. Best-effort: a
 * source that can't fetch returns [], so a library outage yields zero candidates
 * rather than breaking the scan.
 */
export async function detectCompetitorAdOpportunities(input: CompetitorAdDetectInput): Promise<OpportunityCandidate[]> {
  const now = input.now ?? new Date().toISOString();
  const source = input.source ?? configAdSource(input.config);
  const flights = await source.listAdFlights(now);
  return detectCompetitorOpportunities(mapAdFlightsToSignals(flights), { now });
}

export const competitorAdsConnector: SignalSourceConnector = {
  key: "competitor-ads",
  detect: (ctx) => detectCompetitorAdOpportunities(ctx),
};

registerSignalSource(competitorAdsConnector);
