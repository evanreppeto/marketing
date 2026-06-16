import { describe, expect, it } from "vitest";

import { buildPortfolioSplit, toChartPoints } from "../campaign-analytics-model";

describe("buildPortfolioSplit", () => {
  it("sums approved/pending/changes/draft across campaign rollups", () => {
    const split = buildPortfolioSplit([
      { rollup: { approved: 3, pending: 1, changes: 0, draft: 2, total: 6 } },
      { rollup: { approved: 1, pending: 2, changes: 1, draft: 0, total: 4 } },
    ]);
    expect(split).toEqual({
      approved: 4,
      pending: 3,
      changes: 1,
      draft: 2,
      total: 10,
      readiness: 40,
    });
  });

  it("reports zero readiness and empty totals when there are no pieces", () => {
    expect(buildPortfolioSplit([])).toEqual({
      approved: 0,
      pending: 0,
      changes: 0,
      draft: 0,
      total: 0,
      readiness: 0,
    });
  });
});

describe("toChartPoints", () => {
  it("splits numeric rows into chart points and string rows into missing labels", () => {
    const result = toChartPoints([
      { label: "Homeowner", value: 12, detail: "", tone: "blue" },
      { label: "Referral revenue", value: "Missing", detail: "", tone: "amber" },
      { label: "Partner", value: 3, detail: "", tone: "green" },
    ]);
    expect(result.points).toEqual([
      { label: "Homeowner", value: 12, tone: "blue" },
      { label: "Partner", value: 3, tone: "green" },
    ]);
    expect(result.missing).toEqual(["Referral revenue"]);
  });

  it("returns empty arrays for empty input", () => {
    expect(toChartPoints([])).toEqual({ points: [], missing: [] });
  });
});
