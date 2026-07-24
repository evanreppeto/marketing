import {
  detectCompetitorOpportunities,
  mapAdFlightsToSignals,
  type CompetitorAdFlight,
  type OpportunityCandidate,
} from "@/domain";

import { metaAdLibrarySource } from "@/lib/integrations/ads/meta-ad-library";

import { readConnectorCredential } from "../credentials";
import { resolveConnectorCredentialRef } from "../read-model";
import { registerSignalSource, type SignalDetectContext, type SignalSourceConnector } from "../registry";

export const COMPETITOR_ADS_CONNECTOR_KEY = "competitor-ads";

/** Parse the operator's configured search terms / countries (newline or comma separated). */
export function parseAdWatchConfig(config: Record<string, unknown> | null | undefined): { terms: string[]; countries: string[]; adType?: string } {
  const cfg = config ?? {};
  const split = (raw: unknown): string[] =>
    typeof raw === "string"
      ? raw.split(/[\n,]/).map((s) => s.trim()).filter(Boolean)
      : Array.isArray(raw)
        ? raw.filter((v): v is string => typeof v === "string").map((s) => s.trim()).filter(Boolean)
        : [];
  return {
    terms: split(cfg.competitors),
    countries: split(cfg.countries).map((c) => c.toUpperCase()),
    adType: typeof cfg.adType === "string" && cfg.adType.trim() ? cfg.adType.trim() : undefined,
  };
}

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

/**
 * Pick the ad source for a scan: the LIVE Meta Ad Library when the workspace has a
 * token AND configured competitors + countries, else the config seam (dev/demo).
 * Any resolution failure falls back to config so a scan never throws.
 */
async function resolveAdSource(ctx: SignalDetectContext): Promise<CompetitorAdSource> {
  const watch = parseAdWatchConfig(ctx.config);
  if (!ctx.client || !ctx.workspaceId || watch.terms.length === 0 || watch.countries.length === 0) {
    return configAdSource(ctx.config);
  }
  try {
    const ref = await resolveConnectorCredentialRef(ctx.client, ctx.workspaceId, COMPETITOR_ADS_CONNECTOR_KEY);
    const token = await readConnectorCredential(ctx.client, ref);
    if (!token) return configAdSource(ctx.config);
    return metaAdLibrarySource(token, { searchTerms: watch.terms, countries: watch.countries, adType: watch.adType });
  } catch {
    return configAdSource(ctx.config);
  }
}

export const competitorAdsConnector: SignalSourceConnector = {
  key: COMPETITOR_ADS_CONNECTOR_KEY,
  detect: async (ctx) => {
    const source = await resolveAdSource(ctx);
    return detectCompetitorAdOpportunities({ config: ctx.config, now: ctx.now, source });
  },
};

registerSignalSource(competitorAdsConnector);
