import { describe, expect, it } from "vitest";

import type { DispatchStatus, DispatchView } from "@/lib/dispatch/status";
import type { CampaignPerformance } from "@/lib/performance/campaign-performance";

import { buildCampaignResults, formatUsdCents } from "../campaign-results-model";

function dispatch(partial: Partial<DispatchView> & { status: DispatchStatus }): DispatchView {
  return {
    id: "d1",
    campaignId: "c1",
    campaignName: "Storm follow-up",
    assetId: "a1",
    deliverable: "Welcome email",
    channel: "Email",
    status: partial.status,
    scheduledFor: null,
    dispatchedAt: null,
    recipientSummary: null,
    audienceCount: null,
    resultNote: null,
    updatedAt: "2026-06-16",
    ...partial,
  };
}

const livePerf = (over: Partial<Extract<CampaignPerformance, { status: "live" }>> = {}): CampaignPerformance => ({
  status: "live",
  trafficTracked: true,
  money: { realizedRevenueCents: 0, marginCents: 0, wonCount: 0, outcomeCount: 0, estimatedPipelineCents: 0, jobCount: 0, hasData: false },
  traffic: { totalEvents: 0, byType: [], byChannel: [], hasData: false },
  ...over,
});

describe("formatUsdCents", () => {
  it("formats cents as whole-dollar USD", () => {
    expect(formatUsdCents(125000)).toBe("$1,250");
    expect(formatUsdCents(0)).toBe("$0");
  });
});

describe("buildCampaignResults", () => {
  it("delivery is empty when there are no dispatches", () => {
    const r = buildCampaignResults({ dispatches: [], performance: livePerf() });
    expect(r.delivery.hasAnyDispatch).toBe(false);
    expect(r.delivery.buckets).toEqual([]);
    expect(r.delivery.failures).toEqual([]);
  });

  it("counts dispatches into lifecycle-ordered buckets and lists failures", () => {
    const r = buildCampaignResults({
      dispatches: [
        dispatch({ status: "delivered" }),
        dispatch({ id: "d2", status: "sent" }),
        dispatch({ id: "d3", status: "failed", deliverable: "Reminder SMS", channel: "SMS", resultNote: "no number on file" }),
      ],
      performance: livePerf(),
    });
    expect(r.delivery.hasAnyDispatch).toBe(true);
    expect(r.delivery.buckets.map((b) => b.status)).toEqual(["sent", "delivered", "failed"]);
    expect(r.delivery.buckets.find((b) => b.status === "sent")?.count).toBe(1);
    expect(r.delivery.failures).toEqual([
      { id: "d3", deliverable: "Reminder SMS", channel: "SMS", note: "no number on file" },
    ]);
  });

  it("engagement is 'untracked' when performance is unavailable", () => {
    const r = buildCampaignResults({ dispatches: [], performance: { status: "unavailable", message: "no supabase" } });
    expect(r.engagement.state).toBe("untracked");
    expect(r.outcomes.state).toBe("unavailable");
  });

  it("engagement is 'untracked' when trafficTracked is false", () => {
    const r = buildCampaignResults({ dispatches: [], performance: livePerf({ trafficTracked: false }) });
    expect(r.engagement.state).toBe("untracked");
  });

  it("engagement is 'empty' when tracked but no data", () => {
    const r = buildCampaignResults({ dispatches: [], performance: livePerf({ trafficTracked: true }) });
    expect(r.engagement.state).toBe("empty");
  });

  it("engagement is 'data' with formatted breakdowns", () => {
    const r = buildCampaignResults({
      dispatches: [],
      performance: livePerf({ traffic: { totalEvents: 12, byType: [{ label: "Open", count: 8 }], byChannel: [{ label: "Email", count: 12 }], hasData: true } }),
    });
    expect(r.engagement).toMatchObject({ state: "data", totalEvents: 12 });
    if (r.engagement.state === "data") {
      expect(r.engagement.byType).toEqual([{ label: "Open", value: "8" }]);
      expect(r.engagement.byChannel).toEqual([{ label: "Email", value: "12" }]);
    }
  });

  it("outcomes is 'empty' when live but money has no data", () => {
    const r = buildCampaignResults({ dispatches: [], performance: livePerf() });
    expect(r.outcomes.state).toBe("empty");
  });

  it("outcomes is 'data' with USD-formatted money stats", () => {
    const r = buildCampaignResults({
      dispatches: [],
      performance: livePerf({ money: { realizedRevenueCents: 500000, marginCents: 200000, wonCount: 2, outcomeCount: 3, estimatedPipelineCents: 1000000, jobCount: 4, hasData: true } }),
    });
    expect(r.outcomes.state).toBe("data");
    if (r.outcomes.state === "data") {
      expect(r.outcomes.stats).toEqual([
        { label: "Realized revenue", value: "$5,000" },
        { label: "Margin", value: "$2,000" },
        { label: "Jobs won", value: "2 of 3" },
        { label: "Pipeline", value: "$10,000 (4 jobs)" },
      ]);
    }
  });

  it("isEmpty only when no dispatches and no engagement/outcomes data", () => {
    expect(buildCampaignResults({ dispatches: [], performance: livePerf() }).isEmpty).toBe(true);
    expect(buildCampaignResults({ dispatches: [dispatch({ status: "sent" })], performance: livePerf() }).isEmpty).toBe(false);
  });
});
