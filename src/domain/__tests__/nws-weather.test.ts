import { describe, expect, it } from "vitest";

import {
  EMPTY_WEATHER_SERVICE_AREA,
  formatServicePointsInput,
  isWeatherServiceAreaConfigured,
  parseServicePointsInput,
  detectWeatherEventOpportunities,
  mapNwsAlertsToWeatherEvents,
  normalizeNwsSeverity,
  parseWeatherServiceArea,
  summarizeAlertArea,
  summarizeForecastPeriods,
  type NwsAlertsResponse,
  type NwsForecastResponse,
} from "@/domain";

import alertsIl from "@/lib/integrations/weather/__fixtures__/nws-alerts-il.json";
import forecast from "@/lib/integrations/weather/__fixtures__/nws-forecast.json";

const ALERTS = alertsIl as unknown as NwsAlertsResponse;
const FORECAST = forecast as unknown as NwsForecastResponse;

// NOW sits after the expired alert's end and before the active alerts' ends.
const NOW = "2026-06-17T18:00:00.000Z";

describe("mapNwsAlertsToWeatherEvents", () => {
  it("keeps only active alerts (drops expired, Cancel, and non-Actual test)", () => {
    const events = mapNwsAlertsToWeatherEvents(ALERTS, { now: NOW });
    const ids = events.map((e) => e.id);
    expect(ids).toEqual([
      "urn:oid:2.49.0.1.840.0.warn.001.1",
      "urn:oid:2.49.0.1.840.0.watch.002.1",
      "urn:oid:2.49.0.1.840.0.advis.003.1",
    ]);
    // The expired Tornado Warning, the Cancel, and the Test are all excluded.
    expect(ids).not.toContain("urn:oid:2.49.0.1.840.0.expired.004.1");
    expect(ids).not.toContain("urn:oid:2.49.0.1.840.0.cancel.005.1");
    expect(ids).not.toContain("urn:oid:2.49.0.1.840.0.test.006.1");
  });

  it("maps event type, severity, area, effective window, and source urls", () => {
    const [warn] = mapNwsAlertsToWeatherEvents(ALERTS, { now: NOW });
    expect(warn).toMatchObject({
      id: "urn:oid:2.49.0.1.840.0.warn.001.1",
      eventType: "Flash Flood Warning",
      severity: "warning",
      area: "Cook, IL / DuPage, IL +1 more",
      startsAt: "2026-06-17T09:00:00-05:00",
      endsAt: "2026-06-17T21:00:00-05:00",
    });
    expect(warn.sourceUrls).toEqual(["https://api.weather.gov/alerts/urn:oid:2.49.0.1.840.0.warn.001.1"]);
  });

  it("falls back from ends to expires when ends is null", () => {
    const events = mapNwsAlertsToWeatherEvents(ALERTS, { now: NOW });
    const watch = events.find((e) => e.id === "urn:oid:2.49.0.1.840.0.watch.002.1");
    expect(watch?.endsAt).toBe("2026-06-17T20:00:00-05:00");
    expect(watch?.severity).toBe("watch");
  });

  it("dedups repeated alert ids (state/point overlap or re-fetch)", () => {
    const feature = ALERTS.features![0];
    const doubled: NwsAlertsResponse = { features: [feature, feature] };
    expect(mapNwsAlertsToWeatherEvents(doubled, { now: NOW })).toHaveLength(1);
  });

  it("returns [] for an empty or missing feature collection (API-down / no alerts)", () => {
    expect(mapNwsAlertsToWeatherEvents({ features: [] }, { now: NOW })).toEqual([]);
    expect(mapNwsAlertsToWeatherEvents(null, { now: NOW })).toEqual([]);
  });
});

describe("mapped events feed the pure weather detector", () => {
  it("produces one storm-response candidate per active alert, keyed by alert id", () => {
    const events = mapNwsAlertsToWeatherEvents(ALERTS, { now: NOW });
    const candidates = detectWeatherEventOpportunities(events, { now: NOW });
    expect(candidates.map((c) => c.subjectId)).toEqual([
      "urn:oid:2.49.0.1.840.0.warn.001.1",
      "urn:oid:2.49.0.1.840.0.watch.002.1",
      "urn:oid:2.49.0.1.840.0.advis.003.1",
    ]);
    for (const c of candidates) {
      expect(c.kind).toBe("weather_event");
      expect(c.subjectType).toBe("weather_event");
      expect(c.recommendedCampaignType).toBe("storm_response");
    }
    // Severity drives urgency: warning = high, advisory = low.
    expect(candidates[0].urgency).toBe("high");
    expect(candidates[2].urgency).toBe("low");
  });
});

describe("normalizeNwsSeverity", () => {
  it("prefers the event name over the CAP severity", () => {
    expect(normalizeNwsSeverity("Flash Flood Warning", "Minor")).toBe("warning");
    expect(normalizeNwsSeverity("Tornado Watch", "Extreme")).toBe("watch");
    expect(normalizeNwsSeverity("Coastal Flood Advisory", "Severe")).toBe("advisory");
    expect(normalizeNwsSeverity("Special Weather Statement", null)).toBe("advisory");
    expect(normalizeNwsSeverity("Local Area Emergency", "Moderate")).toBe("emergency");
  });

  it("falls back to CAP severity when the event name is unclassified", () => {
    expect(normalizeNwsSeverity("Snow Squall", "Extreme")).toBe("emergency");
    expect(normalizeNwsSeverity("Dense Fog", "Severe")).toBe("warning");
    expect(normalizeNwsSeverity("", "Moderate")).toBe("watch");
    expect(normalizeNwsSeverity(null, "Minor")).toBe("advisory");
    expect(normalizeNwsSeverity(undefined, undefined)).toBe("advisory");
  });
});

describe("summarizeAlertArea", () => {
  it("joins the first two segments and counts the rest", () => {
    expect(summarizeAlertArea("Cook, IL; DuPage, IL; Will, IL")).toBe("Cook, IL / DuPage, IL +1 more");
    expect(summarizeAlertArea("Kane, IL")).toBe("Kane, IL");
    expect(summarizeAlertArea("")).toBe("the coverage area");
    expect(summarizeAlertArea(null)).toBe("the coverage area");
  });
});

describe("parseWeatherServiceArea", () => {
  it("reads state codes from an array or a comma string, uppercased + deduped", () => {
    expect(parseWeatherServiceArea({ states: ["il", "wi"] })).toEqual({ states: ["IL", "WI"], points: [] });
    expect(parseWeatherServiceArea({ states: "IL, WI, IL" })).toEqual({ states: ["IL", "WI"], points: [] });
  });

  it("reads lat-lng points from objects and strings, deduped", () => {
    expect(parseWeatherServiceArea({ points: [{ lat: 41.88, lng: -87.63, label: "Chicago" }] })).toEqual({
      states: [],
      points: [{ lat: 41.88, lng: -87.63, label: "Chicago" }],
    });
    expect(parseWeatherServiceArea({ points: ["41.88,-87.63", "41.88,-87.63"] })).toEqual({
      states: [],
      points: [{ lat: 41.88, lng: -87.63 }],
    });
  });

  it("tolerates the legacy `locations` field (state codes + lat,lng, ignoring city names)", () => {
    expect(parseWeatherServiceArea({ locations: ["IL", "41.88,-87.63", "Chicago"] })).toEqual({
      states: ["IL"],
      points: [{ lat: 41.88, lng: -87.63 }],
    });
  });

  // Guards a tenancy bug: this used to fall back to a built-in { states: ["IL"] }
  // ("BSR's home turf"), so any workspace that enabled the connector without setting
  // an area silently got Illinois storm opportunities carrying real NWS evidence.
  // Watching nowhere is the only honest answer to "you didn't tell me where".
  it("watches nowhere when nothing usable is configured — never a built-in default", () => {
    for (const config of [{}, null, undefined, { states: [] }, { states: [], locations: "Chicago, Naperville" }]) {
      expect(parseWeatherServiceArea(config)).toEqual(EMPTY_WEATHER_SERVICE_AREA);
      expect(isWeatherServiceAreaConfigured(parseWeatherServiceArea(config))).toBe(false);
    }
  });

  it("reports a configured area once the operator sets one", () => {
    expect(isWeatherServiceAreaConfigured(parseWeatherServiceArea({ states: ["IL"] }))).toBe(true);
    expect(isWeatherServiceAreaConfigured(parseWeatherServiceArea({ points: ["41.88,-87.63"] }))).toBe(true);
  });
});

describe("parseServicePointsInput", () => {
  it("reads one lat,lng per line, with an optional label", () => {
    const { points, invalid } = parseServicePointsInput("41.8781,-87.6298 Chicago\n41.7508,-88.1535");
    expect(points).toEqual([
      { lat: 41.8781, lng: -87.6298, label: "Chicago" },
      { lat: 41.7508, lng: -88.1535 },
    ]);
    expect(invalid).toEqual([]);
  });

  it("tolerates blank lines, padding, and spaces around the comma", () => {
    const { points } = parseServicePointsInput("\n  41.88 , -87.63   Chicago  \n\n");
    expect(points).toEqual([{ lat: 41.88, lng: -87.63, label: "Chicago" }]);
  });

  // The whole reason points needed their own field: a point contains a comma, so the
  // comma-separated states input would have split this into two broken halves.
  it("keeps a lat,lng together instead of splitting it on the comma", () => {
    expect(parseServicePointsInput("41.88,-87.63").points).toEqual([{ lat: 41.88, lng: -87.63 }]);
  });

  it("reports unreadable lines rather than dropping them", () => {
    const { points, invalid } = parseServicePointsInput("41.88,-87.63\nChicago\nnot a point");
    expect(points).toEqual([{ lat: 41.88, lng: -87.63 }]);
    expect(invalid).toEqual(["Chicago", "not a point"]);
  });

  it("rejects out-of-range coordinates — NWS would answer a well-formed query about nowhere", () => {
    const { points, invalid } = parseServicePointsInput("91,-87.63\n41.88,-181\n-90,180");
    expect(points).toEqual([{ lat: -90, lng: 180 }]);
    expect(invalid).toEqual(["91,-87.63", "41.88,-181"]);
  });

  it("de-duplicates the same coordinate", () => {
    expect(parseServicePointsInput("41.88,-87.63 Chicago\n41.88,-87.63 Dupe").points).toHaveLength(1);
  });

  it("round-trips through formatServicePointsInput", () => {
    const text = "41.8781,-87.6298 Chicago\n41.7508,-88.1535";
    expect(formatServicePointsInput(parseServicePointsInput(text).points)).toBe(text);
  });

  it("feeds parseWeatherServiceArea — what the editor saves is what the detector reads", () => {
    const { points } = parseServicePointsInput("41.8781,-87.6298 Chicago");
    const area = parseWeatherServiceArea({ points });
    expect(area.points).toEqual([{ lat: 41.8781, lng: -87.6298, label: "Chicago" }]);
    expect(isWeatherServiceAreaConfigured(area)).toBe(true);
  });
});

describe("summarizeForecastPeriods", () => {
  it("condenses the next periods into name/summary/temperature", () => {
    const summary = summarizeForecastPeriods(FORECAST, 2);
    expect(summary).toHaveLength(2);
    expect(summary[0]).toEqual({
      name: "This Afternoon",
      summary: "Severe Thunderstorms Likely",
      temperature: "88°F",
    });
    expect(summarizeForecastPeriods(null)).toEqual([]);
  });
});
