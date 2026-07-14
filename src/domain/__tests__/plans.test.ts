import { describe, expect, it } from "vitest";

import { DEFAULT_PLAN_TIER, PLANS, PLAN_TIERS, normalizePlanTier, planCapCents, planForTier } from "../plans";

describe("plans", () => {
  it("defines a cap for every tier, ascending with tier", () => {
    const caps = PLAN_TIERS.map((t) => PLANS[t].monthlyCapCents);
    expect(caps).toEqual([...caps].sort((a, b) => a - b));
    expect(caps.every((c) => c > 0)).toBe(true);
  });

  it("normalizes unknown/garbage tiers to the default", () => {
    expect(normalizePlanTier("pro")).toBe("pro");
    expect(normalizePlanTier("enterprise")).toBe(DEFAULT_PLAN_TIER);
    expect(normalizePlanTier(null)).toBe(DEFAULT_PLAN_TIER);
    expect(normalizePlanTier(42)).toBe(DEFAULT_PLAN_TIER);
  });

  it("planForTier returns the definition", () => {
    expect(planForTier("starter")).toEqual(PLANS.starter);
  });

  it("planCapCents honors a positive override, else the tier default", () => {
    expect(planCapCents("free")).toBe(PLANS.free.monthlyCapCents);
    expect(planCapCents("free", 25_000)).toBe(25_000);
    expect(planCapCents("pro", 0)).toBe(PLANS.pro.monthlyCapCents); // non-positive override ignored
    expect(planCapCents("pro", null)).toBe(PLANS.pro.monthlyCapCents);
    expect(planCapCents("pro", -5)).toBe(PLANS.pro.monthlyCapCents);
  });
});
