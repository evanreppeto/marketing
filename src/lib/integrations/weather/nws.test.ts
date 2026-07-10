import { beforeEach, describe, expect, it, vi } from "vitest";

import type { WeatherServiceArea } from "@/domain";

import alertsIl from "./__fixtures__/nws-alerts-il.json";
import point from "./__fixtures__/nws-point.json";
import forecast from "./__fixtures__/nws-forecast.json";
import {
  __resetNwsCacheForTests,
  countActiveAlerts,
  fetchActiveAlertsByState,
  fetchPointForecast,
  fetchServiceAreaAlerts,
} from "./nws";
import { checkNwsConnection, nwsWeatherEventSource } from "./nws-source";

const NOW = "2026-06-17T18:00:00.000Z";

type FetchCall = { url: string; headers: Record<string, string> };

/** A fetch stub that routes by URL substring and records every request. */
function makeFetch(routes: Array<{ match: string; body: unknown; status?: number }>) {
  const calls: FetchCall[] = [];
  const impl = (async (input: string | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    calls.push({ url, headers: (init?.headers ?? {}) as Record<string, string> });
    const route = routes.find((r) => url.includes(r.match));
    if (!route) throw new Error(`no route for ${url}`);
    const status = route.status ?? 200;
    return { ok: status >= 200 && status < 300, status, json: async () => route.body } as Response;
  }) as unknown as typeof fetch;
  return { impl, calls };
}

beforeEach(() => {
  __resetNwsCacheForTests();
  vi.unstubAllEnvs();
});

describe("fetchActiveAlertsByState", () => {
  it("hits the active-alerts endpoint for the state and sends a User-Agent", async () => {
    const { impl, calls } = makeFetch([{ match: "/alerts/active", body: alertsIl }]);
    const res = await fetchActiveAlertsByState("il", { fetchImpl: impl });

    expect(res.features).toHaveLength(6);
    expect(calls[0].url).toBe("https://api.weather.gov/alerts/active?status=actual&area=IL");
    expect(calls[0].headers["User-Agent"]).toBeTruthy();
  });

  it("throws on a non-2xx response (surfaced as a failed connectivity test upstream)", async () => {
    const { impl } = makeFetch([{ match: "/alerts/active", body: {}, status: 503 }]);
    await expect(fetchActiveAlertsByState("IL", { fetchImpl: impl })).rejects.toThrow(/503/);
  });

  it("caches within the TTL so a repeat request does not re-fetch", async () => {
    const { impl, calls } = makeFetch([{ match: "/alerts/active", body: alertsIl }]);
    await fetchActiveAlertsByState("IL", { fetchImpl: impl });
    await fetchActiveAlertsByState("IL", { fetchImpl: impl });
    expect(calls).toHaveLength(1);
  });
});

describe("fetchServiceAreaAlerts", () => {
  it("merges + dedups alerts across states and points by alert id", async () => {
    const { impl, calls } = makeFetch([{ match: "/alerts/active", body: alertsIl }]);
    const area: WeatherServiceArea = { states: ["IL", "WI"], points: [{ lat: 41.88, lng: -87.63 }] };
    const res = await fetchServiceAreaAlerts(area, { fetchImpl: impl });

    // 3 distinct URLs fetched (IL, WI, point), but the 6 ids are identical → deduped to 6.
    expect(calls).toHaveLength(3);
    expect(res.features).toHaveLength(6);
  });

  it("is best-effort per source — one failing area does not sink the rest", async () => {
    const { impl } = makeFetch([
      { match: "area=IL", body: alertsIl },
      { match: "area=WI", body: {}, status: 500 },
    ]);
    const area: WeatherServiceArea = { states: ["IL", "WI"], points: [] };
    const res = await fetchServiceAreaAlerts(area, { fetchImpl: impl });
    expect(res.features).toHaveLength(6); // IL succeeded, WI's failure was swallowed
  });

  it("countActiveAlerts returns the deduped feature count", async () => {
    const { impl } = makeFetch([{ match: "/alerts/active", body: alertsIl }]);
    const count = await countActiveAlerts({ states: ["IL"], points: [] }, { fetchImpl: impl });
    expect(count).toBe(6);
  });
});

describe("fetchPointForecast", () => {
  it("resolves the gridpoint forecast URL from /points then fetches it", async () => {
    const { impl, calls } = makeFetch([
      { match: "/points/", body: point },
      { match: "/gridpoints/", body: forecast },
    ]);
    const res = await fetchPointForecast(41.8781, -87.6298, { fetchImpl: impl });

    expect(calls[0].url).toContain("/points/41.8781,-87.6298");
    expect(calls[1].url).toContain("/gridpoints/LOT/76,73/forecast");
    expect(res?.properties?.periods?.[0]?.shortForecast).toBe("Severe Thunderstorms Likely");
  });
});

describe("nwsWeatherEventSource (BSR-361 WeatherEventSource impl)", () => {
  it("maps live alerts to WeatherEventInput, dropping expired/cancel/test", async () => {
    const { impl } = makeFetch([{ match: "/alerts/active", body: alertsIl }]);
    const source = nwsWeatherEventSource({ states: ["IL"], points: [] }, { fetchImpl: impl });
    const events = await source.listActiveEvents(NOW);
    expect(events.map((e) => e.id)).toEqual([
      "urn:oid:2.49.0.1.840.0.warn.001.1",
      "urn:oid:2.49.0.1.840.0.watch.002.1",
      "urn:oid:2.49.0.1.840.0.advis.003.1",
    ]);
  });

  it("degrades to no events when NWS is unreachable (never breaks the scan)", async () => {
    const impl = (async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;
    const source = nwsWeatherEventSource({ states: ["IL"], points: [] }, { fetchImpl: impl });
    expect(await source.listActiveEvents(NOW)).toEqual([]);
  });
});

describe("checkNwsConnection (Test connection probe)", () => {
  it("returns the active-alert count on success", async () => {
    const { impl } = makeFetch([{ match: "/alerts/active", body: alertsIl }]);
    const res = await checkNwsConnection({ states: ["IL"], points: [] }, { fetchImpl: impl });
    expect(res.ok).toBe(true);
    expect(res.count).toBe(6);
  });

  it("includes the next forecast headline when a point is configured", async () => {
    const { impl } = makeFetch([
      { match: "/alerts/active", body: { features: [] } },
      { match: "/points/", body: point },
      { match: "/gridpoints/", body: forecast },
    ]);
    const res = await checkNwsConnection({ states: [], points: [{ lat: 41.88, lng: -87.63 }] }, { fetchImpl: impl });
    expect(res.ok).toBe(true);
    expect(res.count).toBe(0);
    expect(res.forecast).toContain("This Afternoon");
  });

  it("reports ok:false when the feed is unreachable", async () => {
    const impl = (async () => ({ ok: false, status: 500, json: async () => ({}) })) as unknown as typeof fetch;
    const res = await checkNwsConnection({ states: ["IL"], points: [] }, { fetchImpl: impl });
    expect(res.ok).toBe(false);
    expect(res.error).toBeTruthy();
  });
});
