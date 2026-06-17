import { describe, expect, it } from "vitest";

import { detectColdLeadOpportunities, type ColdLeadInput } from "../opportunity-detection";

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
