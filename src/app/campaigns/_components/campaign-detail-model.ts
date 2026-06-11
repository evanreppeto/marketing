import type { CampaignWorkspaceAsset, LiveCampaignWorkspace } from "@/lib/campaigns/read-model";

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
  print: "Export",
  packet: "Export",
  file: "Export",
  call_script: "CRM",
  script: "CRM",
  crm: "CRM",
  lead: "CRM",
  lead_list: "CRM",
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

export function buildCampaignContentRows(detail: LiveCampaignWorkspace): CampaignContentRow[] {
  return detail.assets.map((asset) => {
    const status = contentStatus(asset);
    return {
      id: asset.id,
      title: asset.title,
      description: describeAsset(asset),
      status,
      where: contentWhere(asset),
      nextAction: nextActionForStatus(status),
      preview: asset.preview || asset.body || "No preview available yet.",
    };
  });
}

export function buildCampaignChecklist(detail: LiveCampaignWorkspace): ChecklistStep[] {
  const { requiredCount, pendingCount, approvedCount, ready, live } = detail.launchState;
  const hasContent = requiredCount > 0;
  const allApproved = hasContent && pendingCount === 0 && approvedCount >= requiredCount;
  return [
    {
      label: "Review content",
      detail: !hasContent
        ? "Mark is still building content."
        : pendingCount > 0
          ? `${pendingCount} piece${pendingCount === 1 ? "" : "s"} need review.`
          : "All content has been reviewed.",
      state: !hasContent || pendingCount > 0 ? "active" : "done",
    },
    {
      label: "Approve pieces",
      detail: hasContent ? `${approvedCount} approved.` : "Content must be created before approval.",
      state: !hasContent ? "locked" : allApproved ? "done" : "active",
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
    const status = contentStatus(asset);
    const value: SendExportFact["value"] = status.label === "Live" ? "Live" : status.label === "Ready" ? "Ready" : "Blocked";
    const existing = byWhere.get(where);
    if (!existing || existing === "Ready" || value === "Blocked") byWhere.set(where, value);
  }
  return Array.from(byWhere, ([label, value]) => ({ label, value }));
}

function describeAsset(asset: CampaignWorkspaceAsset): string {
  const where = contentWhere(asset).toLowerCase();
  if (where === "email") return "Email content for this campaign.";
  if (where === "social") return "Social content for this campaign.";
  if (where === "website") return "Website copy for this campaign.";
  if (where === "crm") return "Follow-up content for this campaign.";
  return "Exportable content for this campaign.";
}

function nextActionForStatus(status: PlainStatus): string {
  if (status.label === "Review") return "Approve or ask Mark to revise";
  if (status.label === "Ready") return "Can be sent or exported";
  if (status.label === "Live") return "Check results";
  if (status.label === "Blocked") return "Ask Mark to revise";
  return "Wait for Mark";
}

function destinationKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}
