import { classifyCampaignKind } from "@/domain";
import type { CampaignWorkspaceListItem } from "@/lib/campaigns/read-model";

export type AwaitingPartition = {
  outbound: CampaignWorkspaceListItem[];
  internal: CampaignWorkspaceListItem[];
};

export type MomentumCounts = { live: number; awaiting: number; drafts: number; ready: number };

/** Longest-waiting first; items with unparseable timestamps sort last. */
export function byWaitDesc(a: CampaignWorkspaceListItem, b: CampaignWorkspaceListItem): number {
  const ta = Date.parse(a.updatedAtIso);
  const tb = Date.parse(b.updatedAtIso);
  const va = Number.isNaN(ta) ? Number.POSITIVE_INFINITY : ta;
  const vb = Number.isNaN(tb) ? Number.POSITIVE_INFINITY : tb;
  return va - vb;
}

/** Split awaiting-approval items into outbound (full rows) and internal (CRM
 *  batch fold) buckets, each ordered longest-waiting first. */
export function partitionAwaiting(items: CampaignWorkspaceListItem[]): AwaitingPartition {
  const outbound: CampaignWorkspaceListItem[] = [];
  const internal: CampaignWorkspaceListItem[] = [];
  for (const item of items) {
    const kind = classifyCampaignKind({ assetTypes: item.assetTypes, objective: item.objective });
    (kind === "internal" ? internal : outbound).push(item);
  }
  return { outbound: outbound.sort(byWaitDesc), internal: internal.sort(byWaitDesc) };
}

/** Lifecycle tallies for the momentum strip. */
export function momentumCounts(items: CampaignWorkspaceListItem[]): MomentumCounts {
  const tally = (lifecycle: CampaignWorkspaceListItem["lifecycle"]) =>
    items.filter((item) => item.lifecycle === lifecycle).length;
  return { live: tally("Live"), awaiting: tally("In review"), drafts: tally("Drafting"), ready: tally("Ready") };
}
