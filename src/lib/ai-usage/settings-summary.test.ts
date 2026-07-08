import { describe, expect, it } from "vitest";

import { type UsageSummaryCard } from "@/domain";

import { toUsageView } from "./settings-summary";

describe("toUsageView", () => {
  it("formats a usage card into the Settings summary labels", () => {
    const card: UsageSummaryCard = { totalCostCents: 4880, totalTokens: 1_842_000, totalRuns: 312, pctOfCap: 61, isNearCap: false };
    const view = toUsageView(card, false, true);

    expect(view.tokensLabel).toBe("1.84M");
    expect(view.runsLabel).toBe("312");
    expect(view.costLabel).toBe("$48.80");
    expect(view.capLabel).toBe("$80");
    expect(view.pctOfCap).toBe(61);
    expect(view.configured).toBe(true);
    expect(view.rangeLabel).toBe("Last 30 days");
  });

  it("abbreviates thousands and renders zeros for an empty card", () => {
    expect(toUsageView({ totalCostCents: 0, totalTokens: 4200, totalRuns: 0, pctOfCap: 0, isNearCap: false }, false, false).tokensLabel).toBe("4.2K");
    const zero = toUsageView({ totalCostCents: 0, totalTokens: 0, totalRuns: 0, pctOfCap: 0, isNearCap: false }, false, false);
    expect(zero).toMatchObject({ tokensLabel: "0", costLabel: "$0.00", pctOfCap: 0 });
  });

  it("flags near-cap usage", () => {
    const view = toUsageView({ totalCostCents: 7200, totalTokens: 2_000_000, totalRuns: 400, pctOfCap: 90, isNearCap: true }, true, true);
    expect(view.isNearCap).toBe(true);
    expect(view.isDemo).toBe(true);
  });
});
