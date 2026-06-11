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

export type CampaignManagerView = "needs-attention" | "all" | "ready-to-send" | "mark-working" | "live" | "archived";

export type CampaignManagerTone = "amber" | "blue" | "green" | "gray" | "red";

export type CampaignManagerStatus = {
  label: string;
  tone: CampaignManagerTone;
};

export type CampaignManagerSummary = {
  primary: string;
  secondary: string;
};

const WHERE_LABELS: Record<string, string> = {
  email: "Email",
  sms: "SMS",
  social_ad: "Social",
  meta_ad: "Social",
  paid_social: "Social",
  landing_page: "Website",
  website: "Website",
  one_pager: "Export",
  pdf: "Export",
  call_script: "CRM",
  script: "CRM",
  lead_list: "CRM",
};

export function campaignManagerStatus(campaign: CampaignWorkspaceListItem): CampaignManagerStatus {
  if (/archived/i.test(campaign.status)) return { label: "Archived", tone: "gray" };
  if (campaign.pendingCount > 0) return { label: "Review needed", tone: "amber" };
  if (campaign.lifecycle === "Live") return { label: "Live", tone: "green" };
  if (campaign.lifecycle === "Drafting") return { label: "Mark drafting", tone: "gray" };
  if (campaign.lifecycle === "Ready") return { label: "Ready", tone: "blue" };
  return { label: "Ready", tone: "blue" };
}

export function campaignManagerSummary(campaign: CampaignWorkspaceListItem): CampaignManagerSummary {
  const primary = `${campaign.assetCount} piece${campaign.assetCount === 1 ? "" : "s"}`;
  if (campaign.assetCount === 0) return { primary: "No content yet", secondary: "Mark is building" };
  if (campaign.pendingCount > 0) {
    return {
      primary,
      secondary: `${campaign.pendingCount} need${campaign.pendingCount === 1 ? "s" : ""} review`,
    };
  }
  return { primary, secondary: "all approved" };
}

export function campaignManagerWhere(campaign: CampaignWorkspaceListItem): string[] {
  const labels = campaign.assetTypes
    .map((type) => WHERE_LABELS[assetTypeKey(type)] ?? campaign.channels.find((channel) => channel.toLowerCase() === type.toLowerCase()) ?? "")
    .filter(Boolean);
  const distinct = Array.from(new Set(labels));
  return distinct.length > 0 ? distinct.slice(0, 4) : ["Not chosen"];
}

export function campaignNextStep(campaign: CampaignWorkspaceListItem): string {
  if (campaign.pendingCount > 0) {
    return `Review ${campaign.pendingCount} piece${campaign.pendingCount === 1 ? "" : "s"}`;
  }
  if (campaign.lifecycle === "Ready") return "Send or export";
  if (campaign.lifecycle === "Live") return "Check results";
  if (campaign.lifecycle === "Drafting") return "Wait for Mark";
  if (campaign.assetCount === 0) return "Add content";
  return "Open campaign";
}

export function filterCampaignManagerItems(
  campaigns: CampaignWorkspaceListItem[],
  view: CampaignManagerView,
  query = "",
): CampaignWorkspaceListItem[] {
  const normalized = query.trim().toLowerCase();
  return campaigns.filter((campaign) => {
    if (!matchesManagerView(campaign, view)) return false;
    if (!normalized) return true;
    return campaignSearchText(campaign).includes(normalized);
  });
}

export function managerViewCounts(campaigns: CampaignWorkspaceListItem[]): Record<CampaignManagerView, number> {
  return {
    "needs-attention": campaigns.filter((campaign) => matchesManagerView(campaign, "needs-attention")).length,
    all: campaigns.length,
    "ready-to-send": campaigns.filter((campaign) => matchesManagerView(campaign, "ready-to-send")).length,
    "mark-working": campaigns.filter((campaign) => matchesManagerView(campaign, "mark-working")).length,
    live: campaigns.filter((campaign) => matchesManagerView(campaign, "live")).length,
    archived: campaigns.filter((campaign) => matchesManagerView(campaign, "archived")).length,
  };
}

function matchesManagerView(campaign: CampaignWorkspaceListItem, view: CampaignManagerView): boolean {
  const archived = /archived/i.test(campaign.status);
  if (view === "archived") return archived;
  if (view === "all") return true;
  if (archived) return false;
  if (view === "needs-attention") return campaign.pendingCount > 0 || campaign.lifecycle === "In review";
  if (view === "ready-to-send") return campaign.lifecycle === "Ready";
  if (view === "mark-working") return campaign.lifecycle === "Drafting";
  if (view === "live") return campaign.lifecycle === "Live";
  return false;
}

function assetTypeKey(type: string): string {
  return type
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function campaignSearchText(campaign: CampaignWorkspaceListItem): string {
  return [
    campaign.name,
    campaign.persona,
    campaign.objective,
    campaign.audienceSummary,
    campaign.offerSummary,
    campaign.whyBuilt,
    campaign.status,
    campaign.lifecycle,
    ...campaign.assetTypes,
    ...campaign.channels,
    ...campaignManagerWhere(campaign),
  ]
    .join(" ")
    .toLowerCase();
}
