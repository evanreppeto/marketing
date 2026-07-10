import { describe, expect, it } from "vitest";

import { buildOpportunityConversion, formatRate, type OpportunityConversionFact } from "../opportunity-conversion";

function fact(over: Partial<OpportunityConversionFact> = {}): OpportunityConversionFact {
  return { kind: "cold_lead", persona: "persona_property_manager", urgency: "medium", drafted: false, approved: false, booked: false, ...over };
}

// 10 cold leads: 6 drafted, 4 approved, 2 booked; 4 weather: 2 drafted, 1 approved, 1 booked.
const FACTS: OpportunityConversionFact[] = [
  ...Array.from({ length: 2 }, () => fact({ kind: "cold_lead", drafted: true, approved: true, booked: true })),
  ...Array.from({ length: 2 }, () => fact({ kind: "cold_lead", drafted: true, approved: true, booked: false })),
  ...Array.from({ length: 2 }, () => fact({ kind: "cold_lead", drafted: true, approved: false, booked: false })),
  ...Array.from({ length: 4 }, () => fact({ kind: "cold_lead", drafted: false })),
  fact({ kind: "weather_event", persona: "persona_homeowner_emergency", urgency: "high", drafted: true, approved: true, booked: true }),
  fact({ kind: "weather_event", persona: "persona_homeowner_emergency", urgency: "high", drafted: true, approved: false, booked: false }),
  ...Array.from({ length: 2 }, () => fact({ kind: "weather_event", persona: "persona_homeowner_emergency", urgency: "high", drafted: false })),
];

describe("buildOpportunityConversion", () => {
  it("computes the overall surfaced→drafted→approved→booked funnel + rates", () => {
    const { overall } = buildOpportunityConversion(FACTS);
    expect(overall).toMatchObject({ surfaced: 14, drafted: 8, approved: 5, booked: 3 });
    expect(overall.rates.draftRate).toBeCloseTo(8 / 14);
    expect(overall.rates.approveRate).toBeCloseTo(5 / 8);
    expect(overall.rates.bookRate).toBeCloseTo(3 / 5);
    expect(overall.rates.bookedOfSurfaced).toBeCloseTo(3 / 14);
  });

  it("breaks down by kind, most-surfaced first, with human labels", () => {
    const { byKind } = buildOpportunityConversion(FACTS);
    expect(byKind.map((r) => r.label)).toEqual(["Cold lead", "Weather event"]);
    expect(byKind[0].funnel).toMatchObject({ surfaced: 10, drafted: 6, approved: 4, booked: 2 });
    expect(byKind[1].funnel).toMatchObject({ surfaced: 4, drafted: 2, approved: 1, booked: 1 });
  });

  it("breaks down by persona and urgency band", () => {
    const { byPersona, byUrgency } = buildOpportunityConversion(FACTS);
    expect(byPersona.find((r) => r.label === "Property manager")?.funnel.surfaced).toBe(10);
    expect(byUrgency.find((r) => r.label === "High")?.funnel.booked).toBe(1);
  });

  it("returns null rates (not 0%) when a denominator is empty", () => {
    const { overall } = buildOpportunityConversion([fact({ drafted: false })]);
    expect(overall.rates.approveRate).toBeNull(); // 0 drafted → undefined, not 0%
    expect(formatRate(overall.rates.approveRate)).toBe("—");
    expect(formatRate(overall.rates.draftRate)).toBe("0%");
  });

  it("suppresses the hint for thin data (<3 surfaced)", () => {
    const { byKind } = buildOpportunityConversion([fact({ kind: "competitor_signal", booked: true, approved: true, drafted: true })]);
    expect(byKind[0].hint).toBeNull();
  });

  it("emits a booked hint once there's enough volume", () => {
    const { byKind } = buildOpportunityConversion(FACTS);
    expect(byKind[0].hint).toBe("Cold lead → 20% booked (2/10)");
  });
});
