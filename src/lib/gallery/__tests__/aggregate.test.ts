import { describe, expect, it } from "vitest";

import { aggregateCampaignResults, aggregateTotals, countDispatchFunnel, type GalleryCampaign } from "../aggregate";

describe("countDispatchFunnel", () => {
  it("counts dispatch rows by status with a total", () => {
    const funnel = countDispatchFunnel([{ status: "sent" }, { status: "sent" }, { status: "delivered" }, { status: "queued" }]);
    expect(funnel).toMatchObject({ queued: 1, sent: 2, delivered: 1, scheduled: 0, failed: 0, canceled: 0, total: 4 });
  });
  it("is all-zero for no rows", () => {
    expect(countDispatchFunnel([])).toMatchObject({ total: 0, sent: 0, delivered: 0 });
  });
});

describe("aggregateCampaignResults", () => {
  it("sums metric columns and derives ctr/cpl/roi", () => {
    const m = aggregateCampaignResults([
      { impressions: 1000, clicks: 50, calls: 4, forms: 6, leads: 10, jobs: 2, won_revenue_cents: 500000, spend_cents: 100000 },
      { impressions: 1000, clicks: 50, calls: 0, forms: 4, leads: 0, jobs: 0, won_revenue_cents: 0, spend_cents: 0 },
    ]);
    expect(m).toMatchObject({ impressions: 2000, clicks: 100, leads: 10, jobs: 2, wonRevenueCents: 500000, spendCents: 100000, hasData: true });
    expect(m.ctr).toBeCloseTo(0.05);
    expect(m.costPerLeadCents).toBe(10000);
    expect(m.roi).toBeCloseTo(5);
  });
  it("returns null derived rates on zero denominators, hasData false for no rows", () => {
    const m = aggregateCampaignResults([]);
    expect(m).toMatchObject({ impressions: 0, ctr: null, costPerLeadCents: null, roi: null, hasData: false });
  });
});

describe("aggregateTotals", () => {
  it("sums funnel + metrics across campaigns and re-derives rates", () => {
    const base: GalleryCampaign = {
      id: "c1", name: "A", persona: "PM", href: "/campaigns/c1", thumbnailUrl: null, assetTypes: [], assetCount: 0, mediaCount: 0,
      dispatch: { queued: 0, scheduled: 0, sent: 2, delivered: 1, failed: 0, canceled: 0, total: 3 },
      metrics: { impressions: 1000, clicks: 50, calls: 0, forms: 0, leads: 5, jobs: 1, wonRevenueCents: 200000, spendCents: 50000, ctr: 0.05, costPerLeadCents: 10000, roi: 4, hasData: true },
    };
    const totals = aggregateTotals([base, { ...base, id: "c2" }]);
    expect(totals.campaigns).toBe(2);
    expect(totals.dispatch.total).toBe(6);
    expect(totals.metrics.impressions).toBe(2000);
    expect(totals.metrics.leads).toBe(10);
    expect(totals.metrics.costPerLeadCents).toBe(10000);
  });
});
