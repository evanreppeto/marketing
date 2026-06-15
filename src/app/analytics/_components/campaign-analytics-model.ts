import type { CampaignRollup } from "@/domain";
import type { PerformanceBreakdown, PerformanceTone } from "@/lib/performance/read-model";

/** The funnel only needs the four count fields; the full CampaignRollup (which
 *  also carries state/label/draft) satisfies this structurally. */
export type RollupCounts = Pick<CampaignRollup, "approved" | "pending" | "changes" | "total">;
export type AnalyticsFunnel = RollupCounts & { readiness: number };
export type ChannelCount = { channel: string; count: number };
export type CompositionRow = { label: string; value: number };

/** Approval funnel for one campaign: raw counts plus approved/total readiness. */
export function buildFunnel(rollup: RollupCounts): AnalyticsFunnel {
  const readiness = rollup.total > 0 ? Math.round((rollup.approved / rollup.total) * 100) : 0;
  return { ...rollup, readiness };
}

/** Deliverables grouped by channel, most-used first. Blank channels read as "Unassigned". */
export function buildChannelBreakdown(assets: Array<{ channel: string }>): ChannelCount[] {
  const counts = new Map<string, number>();
  for (const asset of assets) {
    const channel = asset.channel.trim() || "Unassigned";
    counts.set(channel, (counts.get(channel) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([channel, count]) => ({ channel, count }))
    .sort((a, b) => b.count - a.count);
}

/** Real structural counts that exist today, as labeled rows. */
export function buildComposition(metrics: { assets: number; approvals: number; media: number; sources: number }): CompositionRow[] {
  return [
    { label: "Deliverables", value: metrics.assets },
    { label: "Approval items", value: metrics.approvals },
    { label: "Media signals", value: metrics.media },
    { label: "Source records", value: metrics.sources },
  ];
}

export type PortfolioSplit = {
  approved: number;
  pending: number;
  changes: number;
  draft: number;
  total: number;
  readiness: number;
};

export type ChartPoint = { label: string; value: number; tone: PerformanceTone };
export type ChartPoints = { points: ChartPoint[]; missing: string[] };

/** A campaign list item carries its approval counts under `rollup`. `draft` is not in
 *  RollupCounts (the funnel denominator) but the portfolio donut shows it, so add it here. */
type RollupLike = { rollup: RollupCounts & { draft: number } };

/** Aggregate every campaign's approval rollup into one portfolio-wide split for the hero donut. */
export function buildPortfolioSplit(items: RollupLike[]): PortfolioSplit {
  const sum = items.reduce(
    (acc, item) => ({
      approved: acc.approved + item.rollup.approved,
      pending: acc.pending + item.rollup.pending,
      changes: acc.changes + item.rollup.changes,
      draft: acc.draft + item.rollup.draft,
      total: acc.total + item.rollup.total,
    }),
    { approved: 0, pending: 0, changes: 0, draft: 0, total: 0 },
  );
  const readiness = sum.total > 0 ? Math.round((sum.approved / sum.total) * 100) : 0;
  return { ...sum, readiness };
}

/** Split breakdown rows: numeric values become chart points; non-numeric values (the
 *  "Missing" sentinel, or any preformatted string) become honest placeholder labels. */
export function toChartPoints(rows: PerformanceBreakdown[]): ChartPoints {
  const points: ChartPoint[] = [];
  const missing: string[] = [];
  for (const row of rows) {
    if (typeof row.value === "number") {
      points.push({ label: row.label, value: row.value, tone: row.tone });
    } else {
      missing.push(row.label);
    }
  }
  return { points, missing };
}
