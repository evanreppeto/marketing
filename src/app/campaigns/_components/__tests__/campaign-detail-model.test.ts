import { describe, expect, it } from "vitest";

import type { CampaignWorkspaceAsset, LiveCampaignWorkspace } from "@/lib/campaigns/read-model";
import {
  buildCampaignChecklist,
  buildCampaignContentRows,
  buildSendExportFacts,
  contentStatus,
  contentWhere,
} from "../campaign-detail-model";

function asset(overrides: Partial<CampaignWorkspaceAsset> = {}): CampaignWorkspaceAsset {
  return {
    id: overrides.id ?? "asset-1",
    title: overrides.title ?? "Email draft",
    assetType: overrides.assetType ?? "email",
    category: overrides.category ?? "virtual",
    channel: overrides.channel ?? "email",
    status: overrides.status ?? "pending_approval",
    body: overrides.body ?? "Email body",
    preview: overrides.preview ?? "Subject: Hello",
    complianceNotes: overrides.complianceNotes ?? "No issues",
    dispatchLocked: overrides.dispatchLocked ?? true,
    toolSource: overrides.toolSource ?? "mark",
    updatedAt: overrides.updatedAt ?? "Jun 11, 2026",
    media: overrides.media ?? [],
    revision: overrides.revision ?? null,
    approval: overrides.approval ?? { id: "approval-1", status: "pending_owner_approval" },
  };
}

function detail(overrides: Partial<LiveCampaignWorkspace> = {}): LiveCampaignWorkspace {
  const assets =
    overrides.assets ??
    [asset(), asset({ id: "asset-2", title: "One-pager", assetType: "one_pager", status: "approved", dispatchLocked: false })];
  return {
    status: "live",
    campaign: {
      id: "campaign-1",
      name: "Plumber referral campaign",
      persona: "Plumbing Partner",
      restorationFocus: "Flood",
      status: "Pending approval",
      objective: "Create partner referral content.",
      audienceSummary: "Plumbing partners.",
      offerSummary: "Fast handoff.",
      complianceNotes: "Coverage neutral.",
      owner: "Evan",
      launchLocked: true,
      createdAt: "Jun 10, 2026",
      updatedAt: "Jun 11, 2026",
    },
    assets,
    groupedAssets: {},
    approvals: [],
    media: [],
    sources: [],
    activity: [],
    events: [],
    reasoning: { whyBuilt: "Referral fit.", recommendedAction: "Review.", guardrailFlags: [], toolsUsed: [], promptInputs: [] },
    executiveOverview: { what: "Campaign brief.", why: "Referral fit.", timeframe: "This week.", where: "Email.", successTracking: "Replies." },
    metrics: { assets: assets.length, approvals: 1, media: 0, sources: 0 },
    launchState: { requiredCount: assets.length, approvedCount: 1, pendingCount: 1, deployedCount: 0, ready: false, live: false, lifecycle: "In review" },
    markConversation: [],
    approvalHistory: [],
    auditLog: [],
    ...overrides,
  };
}

describe("campaign detail model", () => {
  it("maps asset status to plain labels", () => {
    expect(contentStatus(asset({ status: "pending_approval", dispatchLocked: true }))).toEqual({ label: "Review", tone: "amber" });
    expect(contentStatus(asset({ status: "pending_approval", dispatchLocked: false }))).toEqual({ label: "Review", tone: "amber" });
    expect(contentStatus(asset({ status: "approved", dispatchLocked: false }))).toEqual({ label: "Ready", tone: "blue" });
    expect(contentStatus(asset({ status: "deployed", dispatchLocked: false }))).toEqual({ label: "Live", tone: "green" });
    expect(contentStatus(asset({ status: "revision_requested", dispatchLocked: true }))).toEqual({ label: "Blocked", tone: "red" });
    expect(contentStatus(asset({ status: "draft", dispatchLocked: true }))).toEqual({ label: "Draft", tone: "gray" });
    expect(contentStatus(asset({ status: "other", dispatchLocked: true }))).toEqual({ label: "Draft", tone: "gray" });
  });

  it("maps content to plain destinations", () => {
    expect(contentWhere(asset({ assetType: "email", channel: "email" }))).toBe("Email");
    expect(contentWhere(asset({ assetType: "social_ad", channel: "meta" }))).toBe("Social");
    expect(contentWhere(asset({ assetType: "landing_page", channel: "web" }))).toBe("Website");
    expect(contentWhere(asset({ assetType: "one_pager", channel: "pdf" }))).toBe("Export");
    expect(contentWhere(asset({ assetType: "call_script", channel: "crm" }))).toBe("CRM");
  });

  it("builds content rows with next actions", () => {
    expect(buildCampaignContentRows(detail()).map((row) => ({ title: row.title, status: row.status.label, where: row.where, nextAction: row.nextAction }))).toEqual([
      { title: "Email draft", status: "Review", where: "Email", nextAction: "Approve or ask Mark to revise" },
      { title: "One-pager", status: "Ready", where: "Export", nextAction: "Can be sent or exported" },
    ]);
  });

  it("builds checklist steps from launch state", () => {
    expect(buildCampaignChecklist(detail()).map((step) => ({ label: step.label, state: step.state }))).toEqual([
      { label: "Review content", state: "active" },
      { label: "Approve pieces", state: "active" },
      { label: "Send or export", state: "locked" },
      { label: "Watch results", state: "locked" },
    ]);
  });

  it("builds send/export facts", () => {
    expect(buildSendExportFacts(detail())).toEqual([
      { label: "Email", value: "Blocked" },
      { label: "Export", value: "Ready" },
    ]);
  });
});
