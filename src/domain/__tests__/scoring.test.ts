import { describe, expect, it } from "vitest";

import {
  calculateLeadScore,
  calculatePartnerScore,
  calculateScores,
} from "../scoring";

describe("scoring", () => {
  it("calculates lead score from deterministic urgency signals", () => {
    expect(
      calculateLeadScore({
        standingWater: true,
        photoUploaded: true,
        afterHoursCall: false,
      }),
    ).toBe(70);
  });

  it("caps lead score at 100", () => {
    expect(
      calculateLeadScore({
        standingWater: true,
        photoUploaded: true,
        afterHoursCall: true,
      }),
    ).toBe(100);
  });

  it("uses the zero-state lead score when no signals are present", () => {
    expect(calculateLeadScore()).toBe(10);
  });

  it("calculates partner score by tier and relationship signal", () => {
    expect(
      calculatePartnerScore({
        tier: "A",
        relationshipSignal: "warm_intro",
      }),
    ).toBe(80);

    expect(
      calculatePartnerScore({
        tier: "C",
        relationshipSignal: "cold_outreach",
      }),
    ).toBe(20);
  });

  it("returns zero partner score when no partner signals are present", () => {
    expect(calculatePartnerScore()).toBe(0);
  });

  it("returns combined scores with a stable calculation timestamp when provided", () => {
    expect(
      calculateScores({
        lead: {
          standingWater: true,
          photoUploaded: false,
          afterHoursCall: true,
        },
        partner: {
          tier: "B",
          relationshipSignal: "warm_intro",
        },
        calculatedAt: "2026-05-27T17:00:00.000Z",
      }),
    ).toEqual({
      leadScore: 80,
      partnerScore: 60,
      calculatedAt: "2026-05-27T17:00:00.000Z",
    });
  });
});
