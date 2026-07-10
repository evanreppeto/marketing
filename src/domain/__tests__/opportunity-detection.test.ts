import { describe, expect, it } from "vitest";

import {
  detectColdLeadOpportunities,
  detectCompetitorOpportunities,
  detectWeatherEventOpportunities,
  type ColdLeadInput,
  type CompetitorSignalInput,
  type WeatherEventInput,
} from "../opportunity-detection";

const NOW = "2026-06-17T00:00:00.000Z";
function lead(over: Partial<ColdLeadInput> = {}): ColdLeadInput {
  return {
    id: "lead-1",
    label: "Dana Kasprak",
    persona: "persona_homeowner_emergency",
    leadScore: 70,
    status: "qualified",
    lastActivityAt: "2026-05-01T00:00:00.000Z", // 47 days before NOW
    hasActiveCampaign: false,
    ...over,
  };
}

describe("detectColdLeadOpportunities", () => {
  it("flags a cold, open lead with no active campaign", () => {
    const out = detectColdLeadOpportunities([lead()], { now: NOW });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ kind: "crm_inactivity", subjectType: "lead", subjectId: "lead-1" });
    expect(out[0].evidence.daysCold).toBe(47);
    expect(out[0].confidence).toBeGreaterThan(0);
  });

  it("skips leads that are recent, converted/lost/archived, or already have a campaign", () => {
    expect(detectColdLeadOpportunities([lead({ lastActivityAt: NOW })], { now: NOW })).toEqual([]);
    expect(detectColdLeadOpportunities([lead({ status: "converted" })], { now: NOW })).toEqual([]);
    expect(detectColdLeadOpportunities([lead({ status: "lost" })], { now: NOW })).toEqual([]);
    expect(detectColdLeadOpportunities([lead({ status: "archived" })], { now: NOW })).toEqual([]);
    expect(detectColdLeadOpportunities([lead({ hasActiveCampaign: true })], { now: NOW })).toEqual([]);
  });

  it("respects a custom cold threshold", () => {
    const recentish = lead({ lastActivityAt: "2026-06-10T00:00:00.000Z" }); // 7 days
    expect(detectColdLeadOpportunities([recentish], { now: NOW })).toEqual([]); // default 30
    expect(detectColdLeadOpportunities([recentish], { now: NOW, coldDays: 5 })).toHaveLength(1);
  });

  it("derives higher urgency for high-value, long-cold leads", () => {
    const hot = detectColdLeadOpportunities([lead({ leadScore: 90, lastActivityAt: "2026-03-01T00:00:00.000Z" })], { now: NOW });
    const mild = detectColdLeadOpportunities([lead({ leadScore: 35 })], { now: NOW });
    expect(hot[0].urgency).toBe("high");
    expect(["low", "medium"]).toContain(mild[0].urgency);
  });
});

function weather(over: Partial<WeatherEventInput> = {}): WeatherEventInput {
  return {
    id: "wx-1",
    eventType: "Flash Flood Warning",
    area: "Riverside / Brookfield",
    severity: "warning",
    startsAt: "2026-06-16T22:00:00.000Z",
    endsAt: "2026-06-18T06:00:00.000Z", // after NOW
    zipCodes: ["60546", "60513"],
    sourceUrls: ["https://www.weather.gov/lot/", "https://water.noaa.gov/"],
    ...over,
  };
}

describe("detectWeatherEventOpportunities", () => {
  it("emits a geo-targeted storm-response opportunity from an active alert", () => {
    const out = detectWeatherEventOpportunities([weather()], { now: NOW });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      kind: "weather_event",
      subjectType: "weather_event",
      subjectId: "wx-1",
      recommendedCampaignType: "storm_response",
    });
    expect(out[0].title).toContain("Flash Flood Warning");
    expect(out[0].recommendedAction).toContain("Riverside / Brookfield");
    // Evidence carries persona + event type/area/source URLs for the card.
    expect(out[0].evidence).toMatchObject({
      persona: "persona_homeowner_emergency",
      eventType: "Flash Flood Warning",
      area: "Riverside / Brookfield",
      severity: "warning",
      zipCodes: ["60546", "60513"],
    });
    expect(out[0].evidence.evidence_urls).toEqual(["https://www.weather.gov/lot/", "https://water.noaa.gov/"]);
  });

  it("maps severity to urgency + confidence (advisory→low … emergency→high)", () => {
    const sev = (s: WeatherEventInput["severity"]) => detectWeatherEventOpportunities([weather({ severity: s })], { now: NOW })[0];
    expect(sev("advisory").urgency).toBe("low");
    expect(sev("watch").urgency).toBe("medium");
    expect(sev("warning").urgency).toBe("high");
    expect(sev("emergency").urgency).toBe("high");
    expect(sev("emergency").confidence).toBeGreaterThan(sev("advisory").confidence);
  });

  it("skips alerts whose effective window has already expired", () => {
    const expired = weather({ endsAt: "2026-06-16T00:00:00.000Z" }); // before NOW
    expect(detectWeatherEventOpportunities([expired], { now: NOW })).toEqual([]);
  });

  it("falls back gracefully on unknown severity + missing area", () => {
    const out = detectWeatherEventOpportunities(
      [weather({ severity: "hurricane" as never, area: "", zipCodes: [] })],
      { now: NOW },
    );
    expect(out).toHaveLength(1);
    expect(out[0].urgency).toBe("low"); // unknown → advisory
    expect(out[0].title).toContain("the coverage area");
  });
});

function competitor(over: Partial<CompetitorSignalInput> = {}): CompetitorSignalInput {
  return {
    id: "cc-1",
    competitorName: "ServPro",
    channel: "meta_ad_library",
    status: "confirmed",
    keywords: ["water damage oak park", "flood cleanup", "emergency restoration"],
    creativeCount: 6,
    persona: "persona_homeowner_emergency",
    capturedAt: "2026-06-15T00:00:00.000Z", // 2 days before NOW
    url: "https://www.facebook.com/ads/library/",
    ...over,
  };
}

describe("detectCompetitorOpportunities", () => {
  it("emits a defensive-flight opportunity from an active competitor flight", () => {
    const out = detectCompetitorOpportunities([competitor()], { now: NOW });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      kind: "competitor_signal",
      subjectType: "competitor_signal",
      subjectId: "cc-1",
      urgency: "high", // confirmed + high activity
      recommendedCampaignType: "competitive_defense",
    });
    expect(out[0].title).toContain("ServPro");
    expect(out[0].evidence).toMatchObject({
      competitor: "ServPro",
      channel: "Meta",
      activityLevel: "high",
      creativeCount: 6,
      persona: "persona_homeowner_emergency",
    });
    expect(out[0].evidence.evidence_urls).toEqual(["https://www.facebook.com/ads/library/"]);
    expect(out[0].recommendedAction).toContain("ServPro");
  });

  it("skips archived intel and stale captures", () => {
    expect(detectCompetitorOpportunities([competitor({ status: "archived" })], { now: NOW })).toEqual([]);
    const stale = competitor({ capturedAt: "2026-01-01T00:00:00.000Z" }); // ~167 days old
    expect(detectCompetitorOpportunities([stale], { now: NOW })).toEqual([]);
    // But a generous freshDays window keeps it.
    expect(detectCompetitorOpportunities([stale], { now: NOW, freshDays: 365 })).toHaveLength(1);
  });

  it("softens urgency + confidence for unconfirmed, low-activity intel", () => {
    const soft = detectCompetitorOpportunities(
      [competitor({ status: "needs_review", creativeCount: 1 })],
      { now: NOW },
    )[0];
    const hard = detectCompetitorOpportunities([competitor()], { now: NOW })[0];
    expect(soft.urgency).toBe("low");
    expect(soft.confidence).toBeLessThan(hard.confidence);
    expect(soft.evidence.activityLevel).toBe("low");
  });
});
