import { describe, expect, it } from "vitest";

import {
  assembleJourney,
  classifyTouchStage,
  computeAttribution,
  summarizeFunnel,
  stageOrder,
  TOUCH_KINDS,
  type Journey,
  type JourneyIdentity,
  type JourneyTouch,
} from "../journey";

const CAMPAIGN_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const CAMPAIGN_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const IDENTITY: JourneyIdentity = { id: "c1", label: "Jane Doe", resolution: "known" };

function touch(over: Partial<JourneyTouch> & Pick<JourneyTouch, "id" | "occurredAt" | "kind" | "direction">): JourneyTouch {
  return { channel: null, campaignId: null, assetId: null, summary: null, ...over };
}

describe("classifyTouchStage", () => {
  it("maps known kinds to their stage", () => {
    expect(classifyTouchStage({ kind: TOUCH_KINDS.AdImpression, direction: "outbound" })).toBe("reached");
    expect(classifyTouchStage({ kind: TOUCH_KINDS.EmailClick, direction: "inbound" })).toBe("engaged");
    expect(classifyTouchStage({ kind: TOUCH_KINDS.LeadCreated, direction: "inbound" })).toBe("identified");
    expect(classifyTouchStage({ kind: TOUCH_KINDS.JobOpened, direction: "system" })).toBe("nurtured");
    expect(classifyTouchStage({ kind: TOUCH_KINDS.Payment, direction: "inbound" })).toBe("converted");
    expect(classifyTouchStage({ kind: TOUCH_KINDS.Referral, direction: "inbound" })).toBe("retained");
  });

  it("a conversion touch is always converted regardless of kind", () => {
    expect(classifyTouchStage({ kind: "weird_kind", direction: "outbound", isConversion: true })).toBe("converted");
  });

  it("falls back on direction for unknown kinds", () => {
    expect(classifyTouchStage({ kind: "unknown", direction: "outbound" })).toBe("reached");
    expect(classifyTouchStage({ kind: "unknown", direction: "inbound" })).toBe("engaged");
    expect(classifyTouchStage({ kind: "unknown", direction: "system" })).toBe("identified");
  });
});

describe("assembleJourney", () => {
  it("orders touches oldest→newest and finds first/last times", () => {
    const j = assembleJourney(IDENTITY, [
      touch({ id: "3", occurredAt: "2026-03-10T00:00:00Z", kind: TOUCH_KINDS.LeadCreated, direction: "inbound" }),
      touch({ id: "1", occurredAt: "2026-03-01T00:00:00Z", kind: TOUCH_KINDS.EmailSent, direction: "outbound", campaignId: CAMPAIGN_A, channel: "email" }),
      touch({ id: "2", occurredAt: "2026-03-05T00:00:00Z", kind: TOUCH_KINDS.EmailClick, direction: "inbound", campaignId: CAMPAIGN_A, channel: "email" }),
    ]);
    expect(j.timeline.map((t) => t.id)).toEqual(["1", "2", "3"]);
    expect(j.firstTouchAt).toBe("2026-03-01T00:00:00Z");
    expect(j.lastTouchAt).toBe("2026-03-10T00:00:00Z");
    expect(j.touchCount).toBe(3);
  });

  it("current stage is the furthest stage reached", () => {
    const j = assembleJourney(IDENTITY, [
      touch({ id: "1", occurredAt: "2026-03-01T00:00:00Z", kind: TOUCH_KINDS.EmailSent, direction: "outbound" }),
      touch({ id: "2", occurredAt: "2026-03-05T00:00:00Z", kind: TOUCH_KINDS.LeadCreated, direction: "inbound" }),
    ]);
    expect(j.currentStage).toBe("identified");
    expect(j.stagesReached).toEqual(["reached", "identified"]);
  });

  it("records conversion, value, and days-to-convert", () => {
    const j = assembleJourney(IDENTITY, [
      touch({ id: "1", occurredAt: "2026-03-01T00:00:00Z", kind: TOUCH_KINDS.AdImpression, direction: "outbound", campaignId: CAMPAIGN_A, channel: "meta" }),
      touch({ id: "2", occurredAt: "2026-03-11T00:00:00Z", kind: TOUCH_KINDS.Payment, direction: "inbound", isConversion: true, valueCents: 250000 }),
    ]);
    expect(j.converted).toBe(true);
    expect(j.currentStage).toBe("converted");
    expect(j.conversionValueCents).toBe(250000);
    expect(j.daysToConvert).toBe(10);
  });

  it("marks retained only when a second conversion follows the first", () => {
    const base = [
      touch({ id: "1", occurredAt: "2026-01-01T00:00:00Z", kind: TOUCH_KINDS.Payment, direction: "inbound", isConversion: true, valueCents: 100000 }),
    ];
    const once = assembleJourney(IDENTITY, base);
    expect(once.stagesReached).not.toContain("retained");
    expect(once.currentStage).toBe("converted");

    const twice = assembleJourney(IDENTITY, [
      ...base,
      touch({ id: "2", occurredAt: "2026-05-01T00:00:00Z", kind: TOUCH_KINDS.Payment, direction: "inbound", isConversion: true, valueCents: 80000 }),
    ]);
    expect(twice.currentStage).toBe("retained");
    expect(twice.conversionValueCents).toBe(180000);
  });

  it("a referral before any conversion does not count as retained", () => {
    const j = assembleJourney(IDENTITY, [
      touch({ id: "1", occurredAt: "2026-03-01T00:00:00Z", kind: TOUCH_KINDS.Referral, direction: "inbound" }),
    ]);
    expect(j.stagesReached).not.toContain("retained");
  });

  it("picks first/last attributable touch, skipping untagged ones", () => {
    const j = assembleJourney(IDENTITY, [
      touch({ id: "1", occurredAt: "2026-03-01T00:00:00Z", kind: TOUCH_KINDS.AdImpression, direction: "outbound", campaignId: CAMPAIGN_A, channel: "meta" }),
      touch({ id: "2", occurredAt: "2026-03-05T00:00:00Z", kind: TOUCH_KINDS.SiteVisit, direction: "inbound" }),
      touch({ id: "3", occurredAt: "2026-03-09T00:00:00Z", kind: TOUCH_KINDS.EmailClick, direction: "inbound", campaignId: CAMPAIGN_B, channel: "email" }),
    ]);
    expect(j.firstTouch?.campaignId).toBe(CAMPAIGN_A);
    expect(j.lastTouch?.campaignId).toBe(CAMPAIGN_B);
  });

  it("is total on an empty timeline", () => {
    const j = assembleJourney(IDENTITY, []);
    expect(j.currentStage).toBe("reached");
    expect(j.timeline).toEqual([]);
    expect(j.firstTouch).toBeNull();
    expect(j.converted).toBe(false);
    expect(j.daysToConvert).toBeNull();
  });

  it("appends untimed touches last without throwing", () => {
    const j = assembleJourney(IDENTITY, [
      touch({ id: "timed", occurredAt: "2026-03-01T00:00:00Z", kind: TOUCH_KINDS.EmailSent, direction: "outbound" }),
      touch({ id: "bad", occurredAt: "not-a-date", kind: TOUCH_KINDS.SiteVisit, direction: "inbound" }),
    ]);
    expect(j.timeline.map((t) => t.id)).toEqual(["timed", "bad"]);
    expect(j.firstTouchAt).toBe("2026-03-01T00:00:00Z");
  });
});

function convertedJourney(): Journey {
  return assembleJourney(IDENTITY, [
    touch({ id: "1", occurredAt: "2026-03-01T00:00:00Z", kind: TOUCH_KINDS.AdImpression, direction: "outbound", campaignId: CAMPAIGN_A, channel: "meta" }),
    touch({ id: "2", occurredAt: "2026-03-08T00:00:00Z", kind: TOUCH_KINDS.EmailClick, direction: "inbound", campaignId: CAMPAIGN_B, channel: "email" }),
    touch({ id: "3", occurredAt: "2026-03-15T00:00:00Z", kind: TOUCH_KINDS.Payment, direction: "inbound", isConversion: true, valueCents: 300000 }),
  ]);
}

describe("computeAttribution", () => {
  const now = Date.parse("2026-03-16T00:00:00Z");

  it("last_touch gives all credit to the final campaign touch", () => {
    const rows = computeAttribution(convertedJourney(), "last_touch", now);
    expect(rows).toHaveLength(1);
    expect(rows[0].campaignId).toBe(CAMPAIGN_B);
    expect(rows[0].weight).toBeCloseTo(1, 5);
    expect(rows[0].valueCents).toBe(300000);
  });

  it("first_touch gives all credit to the opening campaign touch", () => {
    const rows = computeAttribution(convertedJourney(), "first_touch", now);
    expect(rows[0].campaignId).toBe(CAMPAIGN_A);
    expect(rows[0].weight).toBeCloseTo(1, 5);
  });

  it("linear splits credit evenly and weights sum to 1", () => {
    const rows = computeAttribution(convertedJourney(), "linear", now);
    const total = rows.reduce((s, r) => s + r.weight, 0);
    expect(total).toBeCloseTo(1, 5);
    expect(rows.every((r) => Math.abs(r.weight - 0.5) < 1e-6)).toBe(true);
  });

  it("time_decay favors touches nearer the conversion", () => {
    const rows = computeAttribution(convertedJourney(), "time_decay", now);
    const b = rows.find((r) => r.campaignId === CAMPAIGN_B)!;
    const a = rows.find((r) => r.campaignId === CAMPAIGN_A)!;
    expect(b.weight).toBeGreaterThan(a.weight);
    expect(rows.reduce((s, r) => s + r.weight, 0)).toBeCloseTo(1, 5);
  });

  it("returns [] when nothing is attributable", () => {
    const j = assembleJourney(IDENTITY, [touch({ id: "1", occurredAt: "2026-03-01T00:00:00Z", kind: TOUCH_KINDS.SiteVisit, direction: "inbound" })]);
    expect(computeAttribution(j, "linear", now)).toEqual([]);
  });
});

describe("summarizeFunnel", () => {
  it("counts journeys reaching at least each stage, monotonically down the ladder", () => {
    const journeys = [
      assembleJourney(IDENTITY, [touch({ id: "1", occurredAt: "2026-03-01T00:00:00Z", kind: TOUCH_KINDS.EmailSent, direction: "outbound" })]), // reached
      assembleJourney(IDENTITY, [touch({ id: "2", occurredAt: "2026-03-01T00:00:00Z", kind: TOUCH_KINDS.LeadCreated, direction: "inbound" })]), // identified
      assembleJourney(IDENTITY, [touch({ id: "3", occurredAt: "2026-03-01T00:00:00Z", kind: TOUCH_KINDS.Payment, direction: "inbound", isConversion: true, valueCents: 1000 })]), // converted
    ];
    const funnel = summarizeFunnel(journeys);
    const byKey = Object.fromEntries(funnel.map((f) => [f.key, f.count]));
    expect(byKey.reached).toBe(3);
    expect(byKey.identified).toBe(2);
    expect(byKey.converted).toBe(1);
    // Monotonic non-increasing
    const counts = funnel.map((f) => f.count);
    expect(counts).toEqual([...counts].sort((a, b) => b - a));
    expect(funnel.find((f) => f.key === "converted")!.rateFromTop).toBeCloseTo(1 / 3, 5);
  });

  it("is total on no journeys", () => {
    const funnel = summarizeFunnel([]);
    expect(funnel).toHaveLength(6);
    expect(funnel.every((f) => f.count === 0 && f.rateFromTop === 0)).toBe(true);
  });
});

describe("stageOrder", () => {
  it("ranks the ladder in order", () => {
    expect(stageOrder("reached")).toBeLessThan(stageOrder("converted"));
    expect(stageOrder("converted")).toBeLessThan(stageOrder("retained"));
  });
});
