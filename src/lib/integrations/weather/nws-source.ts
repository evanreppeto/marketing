import {
  DEMO_WEATHER_SERVICE_AREA,
  mapNwsAlertsToWeatherEvents,
  summarizeForecastPeriods,
  type WeatherServiceArea,
} from "@/domain";
import type { WeatherEventInput } from "@/domain";
import type { WeatherEventSource } from "@/lib/opportunities/detector";

import {
  countActiveAlerts,
  fetchActiveAlertsByPoint,
  fetchActiveAlertsByState,
  fetchPointForecast,
  fetchServiceAreaAlerts,
  type NwsRequestOptions,
} from "./nws";

// ---------------------------------------------------------------------------
// The REAL implementation of BSR-361's injectable `WeatherEventSource`, backed by
// the live NWS/NOAA feed (BSR-364). Read-only: it fetches active alerts for the
// workspace's service area and maps them to WeatherEventInput[] via the pure
// domain mapper. Best-effort — any fetch failure degrades to "no active alerts"
// so the opportunity scan is never broken by an NWS outage.
// ---------------------------------------------------------------------------

/** Build a WeatherEventSource that reads live NWS alerts for `area`. */
export function nwsWeatherEventSource(area: WeatherServiceArea, opts?: NwsRequestOptions): WeatherEventSource {
  return {
    async listActiveEvents(now: string): Promise<WeatherEventInput[]> {
      try {
        const res = await fetchServiceAreaAlerts(area, opts);
        return mapNwsAlertsToWeatherEvents(res, { now });
      } catch {
        return [];
      }
    },
  };
}

export type NwsConnectionResult = {
  ok: boolean;
  /** Active-alert count for the service area (present on success). */
  count?: number;
  /** Short forecast headline for the first configured point (best-effort). */
  forecast?: string;
  error?: string;
};

/**
 * Connectivity probe for the weather signal source: hits NWS with the workspace's
 * service area and returns the current active-alert count (plus, if a point is
 * configured, the next forecast headline). Powers Settings → Test connection.
 * Never throws — a failure is reported as { ok: false }.
 */
export async function checkNwsConnection(
  area: WeatherServiceArea,
  opts?: NwsRequestOptions,
): Promise<NwsConnectionResult> {
  try {
    // A direct, throwing probe of the first configured source, so a genuine NWS
    // outage surfaces as a failed test. countActiveAlerts (below) is best-effort
    // per source and would otherwise mask a total outage as "0 alerts". The
    // probe's response is TTL-cached, so the count re-uses it for free.
    const probeArea = area.states.length || area.points.length ? area : DEMO_WEATHER_SERVICE_AREA;
    if (probeArea.states[0]) await fetchActiveAlertsByState(probeArea.states[0], opts);
    else await fetchActiveAlertsByPoint(probeArea.points[0].lat, probeArea.points[0].lng, opts);

    const count = await countActiveAlerts(probeArea, opts);
    let forecast: string | undefined;
    const point = area.points[0];
    if (point) {
      try {
        const periods = summarizeForecastPeriods(await fetchPointForecast(point.lat, point.lng, opts), 1);
        if (periods[0]) forecast = `${periods[0].name}: ${periods[0].summary}`;
      } catch {
        // forecast is a bonus — a failure here doesn't fail the connectivity check
      }
    }
    return { ok: true, count, ...(forecast ? { forecast } : {}) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "NWS unreachable" };
  }
}
