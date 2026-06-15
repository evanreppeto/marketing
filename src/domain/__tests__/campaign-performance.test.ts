import { describe, expect, it } from "vitest";

import { summarizeCampaignMoney, summarizeCampaignTraffic } from "../campaign-performance";

describe("summarizeCampaignMoney", () => {
  it("sums revenue/margin, counts won outcomes, and sums job pipeline", () => {
    const outcomes = [
      { lead_id: "l1", company_id: null, status: "won", gross_revenue_cents: 10000, gross_margin_cents: 4000 },
      { lead_id: "l1", company_id: null, status: "paid", gross_revenue_cents: 5000, gross_margin_cents: 2000 },
      { lead_id: "l1", company_id: null, status: "lost", gross_revenue_cents: null, gross_margin_cents: null },
    ];
    const jobs = [
      { lead_id: "l1", status: "scheduled", estimated_revenue_cents: 8000 },
      { lead_id: "l1", status: "active", estimated_revenue_cents: null },
    ];
    expect(summarizeCampaignMoney(outcomes, jobs)).toEqual({
      realizedRevenueCents: 15000,
      marginCents: 6000,
      wonCount: 2,
      outcomeCount: 3,
      estimatedPipelineCents: 8000,
      jobCount: 2,
      hasData: true,
    });
  });

  it("reports hasData false when there are no outcomes or jobs", () => {
    expect(summarizeCampaignMoney([], [])).toEqual({
      realizedRevenueCents: 0,
      marginCents: 0,
      wonCount: 0,
      outcomeCount: 0,
      estimatedPipelineCents: 0,
      jobCount: 0,
      hasData: false,
    });
  });
});

describe("summarizeCampaignTraffic", () => {
  it("counts events and groups by type and channel, descending", () => {
    const events = [
      { event_type: "click", channel: "Email" },
      { event_type: "form_submit", channel: "Email" },
      { event_type: "click", channel: "Meta" },
      { event_type: "", channel: null },
    ];
    expect(summarizeCampaignTraffic(events)).toEqual({
      totalEvents: 4,
      byType: [
        { label: "click", count: 2 },
        { label: "form_submit", count: 1 },
        { label: "Other", count: 1 },
      ],
      byChannel: [
        { label: "Email", count: 2 },
        { label: "Meta", count: 1 },
        { label: "Unassigned", count: 1 },
      ],
      hasData: true,
    });
  });

  it("reports hasData false for no events", () => {
    expect(summarizeCampaignTraffic([])).toEqual({
      totalEvents: 0,
      byType: [],
      byChannel: [],
      hasData: false,
    });
  });
});
