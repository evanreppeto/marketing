import { describe, expect, it } from "vitest";

import { centsToUsd, usdFromCents } from "./money";

describe("usdFromCents", () => {
  it("converts the amounts from the live card that exposed this", () => {
    // Arc quoted these as "1,240,000¢" / "760,000¢" / "480,000¢" on a prod
    // opportunity, then summed them correctly to $24,800 — right maths, wrong unit.
    expect(usdFromCents(1_240_000)).toBe(12_400);
    expect(usdFromCents(760_000)).toBe(7_600);
    expect(usdFromCents(480_000)).toBe(4_800);
    expect(usdFromCents(1_240_000)! + usdFromCents(760_000)! + usdFromCents(480_000)!).toBe(24_800);
  });

  it("keeps a missing amount missing rather than calling it $0", () => {
    // "$0 of won revenue" and "revenue unknown" are different claims for an agent
    // that reasons about the numbers out loud.
    expect(usdFromCents(null)).toBeNull();
    expect(usdFromCents(undefined)).toBeNull();
    expect(usdFromCents(Number.NaN)).toBeNull();
    expect(usdFromCents(Number.POSITIVE_INFINITY)).toBeNull();
  });

  it("keeps zero as zero", () => {
    expect(usdFromCents(0)).toBe(0);
  });

  it("carries the cents through as decimals", () => {
    expect(usdFromCents(1_050)).toBe(10.5);
    expect(usdFromCents(1)).toBe(0.01);
    expect(usdFromCents(-2_500)).toBe(-25);
  });
});

describe("centsToUsd", () => {
  const outcome = {
    id: "o1",
    persona: "persona_property_manager",
    grossRevenueCents: 1_040_900,
    grossMarginCents: 437_200,
    status: "won",
  };

  it("replaces the cents field with a dollars field", () => {
    const arcView = centsToUsd(outcome, "grossRevenueCents", "grossMarginCents");
    expect(arcView.grossRevenueUsd).toBe(10_409);
    expect(arcView.grossMarginUsd).toBe(4_372);
  });

  it("removes the cents entirely — the agent must not be able to quote them", () => {
    // The whole point: leaving both would let Arc pick the wrong one, which is
    // exactly what happened when cents were all it had.
    const arcView = centsToUsd(outcome, "grossRevenueCents", "grossMarginCents");
    expect(arcView).not.toHaveProperty("grossRevenueCents");
    expect(arcView).not.toHaveProperty("grossMarginCents");
    expect(JSON.stringify(arcView)).not.toMatch(/Cents/);
  });

  it("leaves every other field alone", () => {
    const arcView = centsToUsd(outcome, "grossRevenueCents");
    expect(arcView.id).toBe("o1");
    expect(arcView.persona).toBe("persona_property_manager");
    expect(arcView.status).toBe("won");
    // Untouched field keeps its cents name until it's named explicitly.
    expect(arcView.grossMarginCents).toBe(437_200);
  });

  it("does not mutate the caller's row", () => {
    const row = { ...outcome };
    centsToUsd(row, "grossRevenueCents");
    expect(row.grossRevenueCents).toBe(1_040_900);
  });

  it("carries a null amount across as a null dollar amount", () => {
    const arcView = centsToUsd({ id: "o2", grossRevenueCents: null }, "grossRevenueCents");
    expect(arcView.grossRevenueUsd).toBeNull();
    expect(arcView).not.toHaveProperty("grossRevenueCents");
  });

  it("ignores fields that are absent or not cents-suffixed", () => {
    const arcView = centsToUsd({ id: "o3" }, "grossRevenueCents", "persona");
    expect(arcView).toEqual({ id: "o3" });
  });
});
