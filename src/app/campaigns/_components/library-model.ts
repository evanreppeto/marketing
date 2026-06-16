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

export type CampaignManagerView = "needs-attention" | "all" | "ready-to-send" | "arc-working" | "live" | "archived";

export type CampaignManagerTone = "amber" | "blue" | "green" | "gray" | "red";

export type CampaignManagerStatus = {
  label: string;
  tone: CampaignManagerTone;
};

export type CampaignManagerSummary = {
  primary: string;
  secondary: string;
};

export type CampaignStartAction = {
  key: CampaignManagerView;
  title: string;
  count: number;
  countLabel: string;
  detail: string;
  cta: string;
  href: string;
  tone: CampaignManagerTone;
};

export type CampaignPreviewText = {
  label: string;
  text: string;
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
  campaign_brief: "Export",
  brief: "Export",
  call_script: "CRM",
  script: "CRM",
  crm: "CRM",
  lead_list: "CRM",
  crm_lead_list_review: "CRM",
  crm_population_batch: "CRM",
  partner_lead_list: "CRM",
};

export function campaignManagerStatus(campaign: CampaignWorkspaceListItem, agentName: string): CampaignManagerStatus {
  if (/archived/i.test(campaign.status)) return { label: "Archived", tone: "gray" };
  if (campaign.pendingCount > 0) return { label: "Review needed", tone: "amber" };
  if (campaign.lifecycle === "Live") return { label: "Live", tone: "green" };
  if (campaign.lifecycle === "Drafting") return { label: `${agentName} drafting`, tone: "gray" };
  if (campaign.lifecycle === "Ready") return { label: "Ready", tone: "blue" };
  return { label: "Ready", tone: "blue" };
}

export function campaignManagerSummary(campaign: CampaignWorkspaceListItem, agentName: string): CampaignManagerSummary {
  const primary = `${campaign.assetCount} piece${campaign.assetCount === 1 ? "" : "s"}`;
  if (campaign.assetCount === 0) return { primary: "No content yet", secondary: `${agentName} is building` };
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
    .map((type) => plainWhereLabel(type) ?? campaign.channels.find((channel) => channel.toLowerCase() === type.toLowerCase()) ?? "")
    .filter(Boolean);
  const distinct = Array.from(new Set(labels));
  return distinct.length > 0 ? distinct.slice(0, 4) : ["Not chosen"];
}

export function campaignAssetKindLabel(kind: string): string {
  return plainWhereLabel(kind) ?? humanize(kind);
}

export function campaignNextStep(campaign: CampaignWorkspaceListItem, agentName: string): string {
  if (campaign.pendingCount > 0) {
    return `Review ${campaign.pendingCount} piece${campaign.pendingCount === 1 ? "" : "s"}`;
  }
  if (campaign.lifecycle === "Ready") return "Send or export";
  if (campaign.lifecycle === "Live") return "Check results";
  if (campaign.lifecycle === "Drafting") return `Wait for ${agentName}`;
  if (campaign.assetCount === 0) return "Add content";
  return "Open campaign";
}

export function campaignDecisionPrompt(campaign: CampaignWorkspaceListItem, agentName: string): string {
  if (campaign.pendingCount > 0) {
    return `Decide whether to approve, revise, or hold ${campaign.pendingCount === 1 ? "this piece" : "these pieces"}.`;
  }
  if (campaign.lifecycle === "Ready") return "Choose where this campaign should be handed off.";
  if (campaign.lifecycle === "Live") return "Watch replies, dispatches, and outcomes.";
  if (campaign.lifecycle === "Drafting") return `Add guidance for ${agentName} if the campaign needs a different direction.`;
  if (campaign.assetCount === 0) return `Add content or ask ${agentName} to keep building.`;
  return "Open the campaign to choose the next action.";
}

export function campaignPreviewText(campaign: CampaignWorkspaceListItem, agentName: string): CampaignPreviewText {
  if (campaign.previewText) {
    return {
      label: campaign.previewLabel || "Preview",
      text: campaign.previewText,
    };
  }
  return {
    label: "Why this exists",
    text: campaign.whyBuilt || campaign.objective || `Open the campaign to see what ${agentName} is building.`,
  };
}

export function buildCampaignStartActions(campaigns: CampaignWorkspaceListItem[], agentName: string): CampaignStartAction[] {
  const counts = managerViewCounts(campaigns);
  const reviewPieces = campaigns.reduce((total, campaign) => total + (matchesManagerView(campaign, "needs-attention") ? campaign.pendingCount : 0), 0);

  return [
    {
      key: "needs-attention",
      title: "Review needed",
      count: counts["needs-attention"],
      countLabel: `${counts["needs-attention"]} campaign${counts["needs-attention"] === 1 ? "" : "s"}`,
      detail:
        reviewPieces > 0
          ? `${reviewPieces} piece${reviewPieces === 1 ? "" : "s"} need a yes, a revision note, or a hold.`
          : "Nothing needs review right now.",
      cta: counts["needs-attention"] > 0 ? "Start reviewing" : "No review needed",
      href: "/campaigns?view=needs-attention",
      tone: counts["needs-attention"] > 0 ? "amber" : "gray",
    },
    {
      key: "ready-to-send",
      title: "Ready to hand off",
      count: counts["ready-to-send"],
      countLabel: `${counts["ready-to-send"]} campaign${counts["ready-to-send"] === 1 ? "" : "s"}`,
      detail: counts["ready-to-send"] > 0 ? "Approved campaigns are waiting for send or export." : "No approved campaigns are waiting.",
      cta: "View ready",
      href: "/campaigns?view=ready-to-send",
      tone: counts["ready-to-send"] > 0 ? "blue" : "gray",
    },
    {
      key: "arc-working",
      title: `${agentName} is drafting`,
      count: counts["arc-working"],
      countLabel: `${counts["arc-working"]} campaign${counts["arc-working"] === 1 ? "" : "s"}`,
      detail: counts["arc-working"] > 0 ? "Drafts are still being prepared." : `${agentName} is not drafting campaigns right now.`,
      cta: "Check drafts",
      href: "/campaigns?view=arc-working",
      tone: counts["arc-working"] > 0 ? "blue" : "gray",
    },
    {
      key: "live",
      title: "Watch results",
      count: counts.live,
      countLabel: `${counts.live} campaign${counts.live === 1 ? "" : "s"}`,
      detail: counts.live > 0 ? "Live campaigns are ready for results and follow-up." : "No campaigns are live yet.",
      cta: "View live",
      href: "/campaigns?view=live",
      tone: counts.live > 0 ? "green" : "gray",
    },
  ];
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
    "arc-working": campaigns.filter((campaign) => matchesManagerView(campaign, "arc-working")).length,
    live: campaigns.filter((campaign) => matchesManagerView(campaign, "live")).length,
    archived: campaigns.filter((campaign) => matchesManagerView(campaign, "archived")).length,
  };
}

export function shouldOpenCampaignCard(campaign: CampaignWorkspaceListItem, visibleCampaignCount: number): boolean {
  return visibleCampaignCount <= 1 || campaign.pendingCount > 0 || campaign.lifecycle === "In review";
}

function matchesManagerView(campaign: CampaignWorkspaceListItem, view: CampaignManagerView): boolean {
  const archived = /archived/i.test(campaign.status);
  if (view === "archived") return archived;
  if (view === "all") return true;
  if (archived) return false;
  if (view === "needs-attention") return campaign.pendingCount > 0 || campaign.lifecycle === "In review";
  if (view === "ready-to-send") return campaign.lifecycle === "Ready";
  if (view === "arc-working") return campaign.lifecycle === "Drafting";
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

function plainWhereLabel(type: string): string | undefined {
  const key = assetTypeKey(type);
  const direct = WHERE_LABELS[key];
  if (direct) return direct;

  const tokens = new Set(key.split("_").filter(Boolean));
  if (tokens.has("email")) return "Email";
  if (tokens.has("sms")) return "SMS";
  if (tokens.has("social") || tokens.has("meta") || tokens.has("ad") || tokens.has("ads")) return "Social";
  if (tokens.has("landing") || tokens.has("website") || tokens.has("web")) return "Website";
  if (tokens.has("crm") || tokens.has("lead") || tokens.has("script")) return "CRM";
  if (tokens.has("brief") || tokens.has("pager") || tokens.has("pdf") || tokens.has("export")) return "Export";
  return undefined;
}

function humanize(value: string) {
  return value.replaceAll("_", " ").replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
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
