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

export function contentStatus(asset: CampaignWorkspaceAsset): PlainStatus {
  const status = asset.status.toLowerCase();
  if (status.includes("deployed") || status.includes("sent") || status.includes("live")) return { label: "Live", tone: "green" };
  if (status.includes("revision") || status.includes("declined") || status.includes("blocked")) return { label: "Blocked", tone: "red" };
  if (!asset.dispatchLocked || status.includes("approved")) return { label: "Ready", tone: "blue" };
  if (status.includes("draft")) return { label: "Draft", tone: "gray" };
  return { label: "Review", tone: "amber" };
}

export function contentWhere(asset: CampaignWorkspaceAsset): string {
  const assetType = asset.assetType.toLowerCase();
  const value = `${asset.assetType} ${asset.channel}`.toLowerCase();
  if (/one.pager|pdf|print|packet|file/.test(assetType)) return "Export";
  if (/call|script|crm|lead/.test(assetType)) return "CRM";
  if (/landing|website|web/.test(assetType)) return "Website";
  if (/social|meta|facebook|instagram|ad/.test(assetType)) return "Social";
  if (/email/.test(value)) return "Email";
  if (/sms|text/.test(value)) return "SMS";
  if (/social|meta|facebook|instagram|ad/.test(value)) return "Social";
  if (/landing|website|web/.test(value)) return "Website";
  if (/one.pager|pdf|print|packet|file/.test(value)) return "Export";
  if (/call|script|crm|lead/.test(value)) return "CRM";
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
  const { pendingCount, approvedCount, ready, live } = detail.launchState;
  return [
    {
      label: "Review content",
      detail: pendingCount > 0 ? `${pendingCount} piece${pendingCount === 1 ? "" : "s"} need review.` : "All content has been reviewed.",
      state: pendingCount > 0 ? "active" : "done",
    },
    {
      label: "Approve pieces",
      detail: `${approvedCount} approved.`,
      state: pendingCount > 0 ? "active" : "done",
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
