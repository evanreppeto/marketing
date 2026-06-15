import type { CampaignRollup } from "@/domain";

export type AnalyticsFunnel = CampaignRollup & { readiness: number };
export type ChannelCount = { channel: string; count: number };
export type CompositionRow = { label: string; value: number };

/** Approval funnel for one campaign: raw counts plus approved/total readiness. */
export function buildFunnel(rollup: CampaignRollup): AnalyticsFunnel {
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
