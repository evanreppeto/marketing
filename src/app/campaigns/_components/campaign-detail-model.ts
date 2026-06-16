import type { CampaignLaunchState, CampaignWorkspaceAsset, LiveCampaignWorkspace } from "@/lib/campaigns/read-model";

export type PlainTone = "amber" | "blue" | "green" | "gray" | "red";

export type PlainStatus = {
  label: "Review" | "Ready" | "Live" | "Draft" | "Blocked";
  tone: PlainTone;
};

export type ChecklistStep = {
  label: "Review content" | "Approve pieces" | "Send or export" | "Watch results";
  detail: string;
  state: "done" | "active" | "locked";
};

export type CampaignContentRow = {
  id: string;
  title: string;
  description: string;
  status: PlainStatus;
  where: string;
  nextAction: string;
  preview: string;
};

export type SendExportFact = {
  label: string;
  value: "Ready" | "Blocked" | "Not connected" | "Sent" | "Live";
};

export type CampaignPackageSummary = {
  total: number;
  review: number;
  ready: number;
  live: number;
  draft: number;
  blocked: number;
  media: number;
  destinations: string[];
};

export type CampaignActionHub = {
  title: string;
  detail: string;
  primaryLabel: string;
  primaryHref: string;
  secondaryLabel: string;
  secondaryHref: string;
  cards: CampaignActionCard[];
};

export type CampaignActionCard = {
  key: "review" | "ready" | "arc" | "results";
  title: string;
  value: string;
  detail: string;
  href: string;
  tone: PlainTone;
};

const WHERE_LABELS: Record<string, string> = {
  email: "Email",
  sms: "SMS",
  text: "SMS",
  social: "Social",
  social_ad: "Social",
  meta: "Social",
  meta_ad: "Social",
  facebook: "Social",
  instagram: "Social",
  paid_social: "Social",
  ad: "Social",
  ads: "Social",
  landing_page: "Website",
  website: "Website",
  web: "Website",
  one_pager: "Export",
  pdf: "Export",
  campaign_brief: "Export",
  brief: "Export",
  print: "Export",
  packet: "Export",
  file: "Export",
  call_script: "CRM",
  script: "CRM",
  crm: "CRM",
  lead: "CRM",
  lead_list: "CRM",
  crm_lead_list_review: "CRM",
  crm_population_batch: "CRM",
  partner_lead_list: "CRM",
};

export function contentStatus(asset: CampaignWorkspaceAsset): PlainStatus {
  const assetStatus = asset.status.toLowerCase();
  if (assetStatus.includes("deployed") || assetStatus.includes("sent") || assetStatus.includes("live")) return { label: "Live", tone: "green" };

  const status = (asset.approval?.status ?? asset.status).toLowerCase();
  if (status.includes("revision") || status.includes("declined") || status.includes("blocked")) return { label: "Blocked", tone: "red" };
  if (status.includes("pending")) return { label: "Review", tone: "amber" };
  if (status.includes("draft")) return { label: "Draft", tone: "gray" };
  if (!asset.dispatchLocked || status.includes("approved")) return { label: "Ready", tone: "blue" };
  return { label: "Draft", tone: "gray" };
}

export function contentStatusForLaunch(asset: CampaignWorkspaceAsset, launchState: CampaignLaunchState): PlainStatus {
  void launchState;
  const status = contentStatus(asset);
  if (status.label === "Ready" && !asset.dispatchLocked) return { label: "Live", tone: "green" };
  return status;
}

export function contentWhere(asset: CampaignWorkspaceAsset): string {
  const assetType = destinationKey(asset.assetType);
  const channel = destinationKey(asset.channel);
  const direct = WHERE_LABELS[assetType] ?? WHERE_LABELS[channel];
  if (direct) return direct;

  const tokens = new Set([...assetType.split("_"), ...channel.split("_")].filter(Boolean));
  if (tokens.has("email")) return "Email";
  if (tokens.has("sms") || tokens.has("text")) return "SMS";
  if (tokens.has("social") || tokens.has("meta") || tokens.has("facebook") || tokens.has("instagram") || tokens.has("ad") || tokens.has("ads")) return "Social";
  if (tokens.has("landing") || tokens.has("website") || tokens.has("web")) return "Website";
  if (tokens.has("pager") || tokens.has("pdf") || tokens.has("print") || tokens.has("packet") || tokens.has("file")) return "Export";
  if (tokens.has("call") || tokens.has("script") || tokens.has("crm") || tokens.has("lead")) return "CRM";
  return "Export";
}

export function buildCampaignContentRows(detail: LiveCampaignWorkspace, agentName: string): CampaignContentRow[] {
  return detail.assets.map((asset) => {
    const status = contentStatusForLaunch(asset, detail.launchState);
    return {
      id: asset.id,
      title: asset.title,
      description: describeAsset(asset),
      status,
      where: contentWhere(asset),
      nextAction: nextActionForStatus(status, agentName),
      preview: asset.preview || asset.body || "No preview available yet.",
    };
  });
}

export function buildCampaignChecklist(detail: LiveCampaignWorkspace, agentName: string): ChecklistStep[] {
  const { requiredCount, pendingCount, approvedCount, ready, live } = detail.launchState;
  const hasContent = requiredCount > 0;
  const allApproved = hasContent && pendingCount === 0 && approvedCount >= requiredCount;
  return [
    {
      label: "Review content",
      detail: !hasContent
        ? `${agentName} is still building content.`
        : pendingCount > 0
          ? `${pendingCount} piece${pendingCount === 1 ? "" : "s"} need review.`
          : "All content has been reviewed.",
      state: !hasContent || pendingCount > 0 ? "active" : "done",
    },
    {
      label: "Approve pieces",
      detail: hasContent ? `${approvedCount} approved.` : "Content must be created before approval.",
      state: !hasContent || pendingCount > 0 ? "locked" : allApproved ? "done" : "active",
    },
    {
      label: "Send or export",
      detail: ready || live ? "Ready content can be sent or exported." : "Approve content first.",
      state: live ? "done" : ready ? "active" : "locked",
    },
    {
      label: "Watch results",
      detail: live ? "Results are available as they come in." : "Results appear after sending.",
      state: live ? "active" : "locked",
    },
  ];
}

export function buildSendExportFacts(detail: LiveCampaignWorkspace): SendExportFact[] {
  const byWhere = new Map<string, SendExportFact["value"]>();
  for (const asset of detail.assets) {
    const where = contentWhere(asset);
    const status = contentStatusForLaunch(asset, detail.launchState);
    const value: SendExportFact["value"] = status.label === "Live" ? "Live" : status.label === "Ready" ? "Ready" : "Blocked";
    const existing = byWhere.get(where);
    if (!existing || existing === "Ready" || value === "Blocked") byWhere.set(where, value);
  }
  return Array.from(byWhere, ([label, value]) => ({ label, value }));
}

export function buildCampaignPackageSummary(detail: LiveCampaignWorkspace): CampaignPackageSummary {
  const summary: CampaignPackageSummary = {
    total: detail.assets.length,
    review: 0,
    ready: 0,
    live: 0,
    draft: 0,
    blocked: 0,
    media: detail.media.length,
    destinations: [],
  };
  const destinations = new Set<string>();

  for (const asset of detail.assets) {
    const status = contentStatusForLaunch(asset, detail.launchState).label;
    if (status === "Review") summary.review += 1;
    if (status === "Ready") summary.ready += 1;
    if (status === "Live") summary.live += 1;
    if (status === "Draft") summary.draft += 1;
    if (status === "Blocked") summary.blocked += 1;
    destinations.add(contentWhere(asset));
  }

  summary.destinations = Array.from(destinations);
  return summary;
}

export function buildCampaignActionHub(detail: LiveCampaignWorkspace, agentName: string, dispatchCount = 0): CampaignActionHub {
  const { campaign, launchState, assets } = detail;
  const destinationList = Array.from(new Set(assets.map(contentWhere))).slice(0, 4);
  const destinations = destinationList.length > 0 ? destinationList.join(", ") : "Not chosen yet";
  const approvedOrLive = assets.filter((asset) => ["Ready", "Live"].includes(contentStatusForLaunch(asset, launchState).label)).length;

  if (launchState.live) {
    return {
      title: "This campaign is live",
      detail: `Use this page to watch what happened, ask ${agentName} for follow-up, or reopen anything that needs another pass.`,
      primaryLabel: "See results",
      primaryHref: "#results",
      secondaryLabel: `Ask ${agentName}`,
      secondaryHref: "#arc",
      cards: actionCards({ detail, destinations, approvedOrLive, dispatchCount, agentName }),
    };
  }

  if (launchState.pendingCount > 0) {
    return {
      title: `${launchState.pendingCount} ${pieceWord(launchState.pendingCount)} ${launchState.pendingCount === 1 ? "needs" : "need"} your review`,
      detail: `${campaign.name} is waiting on simple decisions. Read each piece, then approve it or ask ${agentName} to change it.`,
      primaryLabel: "Start reviewing",
      primaryHref: "#content",
      secondaryLabel: `Ask ${agentName}`,
      secondaryHref: "#arc",
      cards: actionCards({ detail, destinations, approvedOrLive, dispatchCount, agentName }),
    };
  }

  if (launchState.ready) {
    return {
      title: "Everything is approved",
      detail: `The campaign is ready to send, export, or hand to ${agentName} for the next step.`,
      primaryLabel: "Send or export",
      primaryHref: "#send-export",
      secondaryLabel: "Review pieces",
      secondaryHref: "#content",
      cards: actionCards({ detail, destinations, approvedOrLive, dispatchCount, agentName }),
    };
  }

  return {
    title: `${agentName} is building this campaign`,
    detail: `This page will become the review and send workspace as soon as ${agentName} adds campaign pieces.`,
    primaryLabel: `Ask ${agentName} for an update`,
    primaryHref: "#arc",
    secondaryLabel: "See campaign basics",
    secondaryHref: "#summary",
    cards: actionCards({ detail, destinations, approvedOrLive, dispatchCount, agentName }),
  };
}

function describeAsset(asset: CampaignWorkspaceAsset): string {
  const where = contentWhere(asset).toLowerCase();
  if (where === "email") return "Email content for this campaign.";
  if (where === "social") return "Social content for this campaign.";
  if (where === "website") return "Website copy for this campaign.";
  if (where === "crm") return "Follow-up content for this campaign.";
  return "Exportable content for this campaign.";
}

function actionCards({
  detail,
  destinations,
  approvedOrLive,
  dispatchCount,
  agentName,
}: {
  detail: LiveCampaignWorkspace;
  destinations: string;
  approvedOrLive: number;
  dispatchCount: number;
  agentName: string;
}): CampaignActionCard[] {
  const { launchState, assets, reasoning } = detail;
  return [
    {
      key: "review",
      title: "Review",
      value: launchState.pendingCount > 0 ? `${launchState.pendingCount} waiting` : "No review needed",
      detail: launchState.pendingCount > 0 ? `Approve what looks good, or send notes back to ${agentName}.` : "All current pieces have a decision.",
      href: "#content",
      tone: launchState.pendingCount > 0 ? "amber" : "green",
    },
    {
      key: "ready",
      title: "Send or export",
      value: launchState.live ? "Live" : launchState.ready ? "Ready" : `${approvedOrLive}/${assets.length || 0} ready`,
      detail: destinations,
      href: "#send-export",
      tone: launchState.live || launchState.ready ? "green" : "blue",
    },
    {
      key: "arc",
      title: agentName,
      value: reasoning.recommendedAction ? "Available" : "Ask for help",
      detail: reasoning.recommendedAction || reasoning.whyBuilt || "Ask for edits, additions, or a quick explanation.",
      href: "#arc",
      tone: "blue",
    },
    {
      key: "results",
      title: "Results",
      value: dispatchCount > 0 ? `${dispatchCount} update${dispatchCount === 1 ? "" : "s"}` : "Not started",
      detail: launchState.live ? "Watch sends, replies, and outcomes here." : "Results appear after the campaign goes out.",
      href: "#results",
      tone: launchState.live ? "green" : "gray",
    },
  ];
}

function pieceWord(count: number) {
  return count === 1 ? "piece" : "pieces";
}

function nextActionForStatus(status: PlainStatus, agentName: string): string {
  if (status.label === "Review") return `Approve or ask ${agentName} to revise`;
  if (status.label === "Ready") return "Can be sent or exported";
  if (status.label === "Live") return "Check results";
  if (status.label === "Blocked") return `Ask ${agentName} to revise`;
  return `Wait for ${agentName}`;
}

function destinationKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}
