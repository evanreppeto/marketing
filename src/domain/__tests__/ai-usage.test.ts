import { describe, expect, it } from "vitest";

import {
  PRICING_VERSION,
  estimateClaudeCostCents,
  estimateMediaCostCents,
  isPricedModel,
} from "../ai-usage";

describe("estimateClaudeCostCents", () => {
  it("prices opus from input+output tokens (cents per million)", () => {
    // opus: 1500 c/Mtok in, 7500 c/Mtok out.
    // 1,000,000 in -> 1500c; 200,000 out -> 1500c; total 3000c
    expect(estimateClaudeCostCents("claude-opus-4-8", 1_000_000, 200_000)).toBe(3000);
  });

  it("prices haiku cheaper than opus for the same tokens", () => {
    const haiku = estimateClaudeCostCents("claude-haiku-4-5", 1_000_000, 1_000_000);
    const opus = estimateClaudeCostCents("claude-opus-4-8", 1_000_000, 1_000_000);
    expect(haiku).toBeLessThan(opus);
    expect(haiku).toBeGreaterThan(0);
  });

  it("matches a known model by prefix when an exact id is missing", () => {
    expect(estimateClaudeCostCents("claude-opus-4-8-20260101", 1_000_000, 0)).toBe(1500);
  });

  it("returns 0 for an unknown model", () => {
    expect(estimateClaudeCostCents("some-unknown-model", 1_000_000, 1_000_000)).toBe(0);
  });

  it("rounds to the nearest cent and treats null tokens as zero", () => {
    expect(estimateClaudeCostCents("claude-haiku-4-5", null, null)).toBe(0);
  });
});

describe("estimateMediaCostCents", () => {
  it("prices image generations per unit", () => {
    expect(estimateMediaCostCents("gemini_image", 3)).toBe(12); // 4c each
  });

  it("prices video generations per unit higher than images", () => {
    expect(estimateMediaCostCents("gemini_video", 1)).toBeGreaterThan(
      estimateMediaCostCents("gemini_image", 1),
    );
  });

  it("defaults missing units to 1", () => {
    expect(estimateMediaCostCents("gemini_image", null)).toBe(4);
  });
});

describe("isPricedModel / PRICING_VERSION", () => {
  it("flags known vs unknown models", () => {
    expect(isPricedModel("claude-opus-4-8")).toBe(true);
    expect(isPricedModel("mystery")).toBe(false);
  });

  it("exposes a pricing version string", () => {
    expect(typeof PRICING_VERSION).toBe("string");
    expect(PRICING_VERSION.length).toBeGreaterThan(0);
  });
});
