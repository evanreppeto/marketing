import { detectWeatherEventOpportunities, parseWeatherServiceArea, type OpportunityCandidate } from "@/domain";
import { nwsWeatherEventSource } from "@/lib/integrations/weather/nws-source";
import type { WeatherEventSource } from "@/lib/opportunities/detector";

import { registerSignalSource, type SignalDetectContext, type SignalSourceConnector } from "../registry";

// ---------------------------------------------------------------------------
// Real `weather-signals` signal_source connector (BSR-364), replacing the BSR-363
// stub. Read-only: it parses the workspace's service area from its per-workspace
// config, pulls active NWS/NOAA alerts for that area, and maps them to
// `weather_event` opportunity candidates via the pure domain detector. It makes
// NO write and nothing outbound — the orchestrator is the only writer, and only
// to `opportunities` via upsertOpportunities.
//
// subjectId is the CAP alert id, so upsertOpportunities' open-status dedup keeps
// re-scans (and state/point overlap) from flooding the inbox. No credential is
// needed — api.weather.gov is public (costTier: free).
// ---------------------------------------------------------------------------

export type WeatherDetectInput = Pick<SignalDetectContext, "config"> & {
  now?: string;
  /** Injected in tests with a fixture-backed source so no live network is hit. */
  source?: WeatherEventSource;
};

/**
 * Detect storm-response opportunities from live NWS alerts. Best-effort: the
 * source swallows fetch failures (returns no events), so an NWS outage yields
 * zero candidates rather than breaking the scan.
 */
export async function detectWeatherOpportunities(input: WeatherDetectInput): Promise<OpportunityCandidate[]> {
  const now = input.now ?? new Date().toISOString();
  const area = parseWeatherServiceArea(input.config);
  const source = input.source ?? nwsWeatherEventSource(area);
  const events = await source.listActiveEvents(now);
  return detectWeatherEventOpportunities(events, { now });
}

export const weatherSignalConnector: SignalSourceConnector = {
  key: "weather-signals",
  detect: (ctx) => detectWeatherOpportunities(ctx),
};

registerSignalSource(weatherSignalConnector);
