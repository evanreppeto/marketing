import { DISPATCH_STATUS_ORDER, statusLabel, type DispatchStatus, type DispatchView } from "@/lib/dispatch/status";
import type { CampaignPerformance } from "@/lib/performance/campaign-performance";

export type DeliveryBucket = { status: DispatchStatus; label: string; count: number };
export type DeliveryFailure = { id: string; deliverable: string; channel: string; note: string | null };
export type DeliveryTier = { hasAnyDispatch: boolean; buckets: DeliveryBucket[]; failures: DeliveryFailure[] };

export type MetricStat = { label: string; value: string };

export type EngagementTier =
  | { state: "untracked" }
  | { state: "empty" }
  | { state: "data"; totalEvents: number; byType: MetricStat[]; byChannel: MetricStat[] };

export type OutcomesTier = { state: "unavailable" } | { state: "empty" } | { state: "data"; stats: MetricStat[] };

export type CampaignResults = {
  delivery: DeliveryTier;
  engagement: EngagementTier;
  outcomes: OutcomesTier;
  /** true only when no tier has anything real to show — drives one whole-section empty state. */
  isEmpty: boolean;
};

export type BuildCampaignResultsInput = {
  dispatches: DispatchView[];
  performance: CampaignPerformance;
};

/** Whole-dollar USD from cents. No shared formatter exists in the codebase. */
export function formatUsdCents(cents: number): string {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function buildDelivery(dispatches: DispatchView[]): DeliveryTier {
  const buckets = DISPATCH_STATUS_ORDER.map((status) => ({
    status,
    label: statusLabel(status),
    count: dispatches.filter((d) => d.status === status).length,
  })).filter((b) => b.count > 0);

  const failures = dispatches
    .filter((d) => d.status === "failed")
    .map((d) => ({ id: d.id, deliverable: d.deliverable, channel: d.channel, note: d.resultNote }));

  return { hasAnyDispatch: dispatches.length > 0, buckets, failures };
}

function buildEngagement(performance: CampaignPerformance): EngagementTier {
  if (performance.status !== "live" || !performance.trafficTracked) return { state: "untracked" };
  const t = performance.traffic;
  if (!t.hasData) return { state: "empty" };
  return {
    state: "data",
    totalEvents: t.totalEvents,
    byType: t.byType.map((x) => ({ label: x.label, value: String(x.count) })),
    byChannel: t.byChannel.map((x) => ({ label: x.label, value: String(x.count) })),
  };
}

function buildOutcomes(performance: CampaignPerformance): OutcomesTier {
  if (performance.status !== "live") return { state: "unavailable" };
  const m = performance.money;
  if (!m.hasData) return { state: "empty" };
  return {
    state: "data",
    stats: [
      { label: "Realized revenue", value: formatUsdCents(m.realizedRevenueCents) },
      { label: "Margin", value: formatUsdCents(m.marginCents) },
      { label: "Jobs won", value: `${m.wonCount} of ${m.outcomeCount}` },
      { label: "Pipeline", value: `${formatUsdCents(m.estimatedPipelineCents)} (${m.jobCount} job${m.jobCount === 1 ? "" : "s"})` },
    ],
  };
}

/**
 * Pure view-model for the campaign Results section. Buckets dispatches by lifecycle
 * status, lists failures, and maps performance money/traffic into display tiers with
 * honest empty/untracked/unavailable states. No I/O.
 */
export function buildCampaignResults(input: BuildCampaignResultsInput): CampaignResults {
  const delivery = buildDelivery(input.dispatches);
  const engagement = buildEngagement(input.performance);
  const outcomes = buildOutcomes(input.performance);
  const isEmpty = !delivery.hasAnyDispatch && engagement.state !== "data" && outcomes.state !== "data";
  return { delivery, engagement, outcomes, isEmpty };
}
