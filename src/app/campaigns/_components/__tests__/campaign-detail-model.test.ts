import { describe, expect, it } from "vitest";

import type { CampaignWorkspaceAsset, LiveCampaignWorkspace } from "@/lib/campaigns/read-model";
import {
  buildCampaignActionHub,
  buildCampaignChecklist,
  buildCampaignContentRows,
  buildCampaignPackageSummary,
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
    toolSource: overrides.toolSource ?? "arc",
    updatedAt: overrides.updatedAt ?? "Jun 11, 2026",
    media: overrides.media ?? [],
    revision: overrides.revision ?? null,
    approval: "approval" in overrides ? (overrides.approval ?? null) : { id: "approval-1", status: "pending_owner_approval" },
  };
}

function detail(overrides: Partial<LiveCampaignWorkspace> = {}): LiveCampaignWorkspace {
  const assets =
    overrides.assets ??
    [
      asset(),
      asset({
        id: "asset-2",
        title: "One-pager",
        assetType: "one_pager",
        status: "approved",
        dispatchLocked: false,
        approval: { id: "approval-2", status: "approved" },
      }),
    ];
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
      rollup: {
        state: "needs_review",
        label: "Needs your review · 1 pending",
        approved: 1,
        pending: 1,
        changes: 0,
        draft: 0,
        total: 2,
      },
    },
    assets,
    groupedAssets: {
      ads: [],
      media: [],
      physical: [],
      virtual: assets,
      other: [],
    },
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
    expect(contentStatus(asset({ status: "pending_approval", dispatchLocked: true, approval: null }))).toEqual({ label: "Review", tone: "amber" });
    expect(contentStatus(asset({ status: "pending_approval", dispatchLocked: false, approval: null }))).toEqual({ label: "Review", tone: "amber" });
    expect(contentStatus(asset({ status: "approved", dispatchLocked: false, approval: null }))).toEqual({ label: "Ready", tone: "blue" });
    expect(contentStatus(asset({ status: "deployed", dispatchLocked: false, approval: null }))).toEqual({ label: "Live", tone: "green" });
    expect(contentStatus(asset({ status: "revision_requested", dispatchLocked: true, approval: null }))).toEqual({ label: "Blocked", tone: "red" });
    expect(contentStatus(asset({ status: "draft", dispatchLocked: true, approval: null }))).toEqual({ label: "Draft", tone: "gray" });
    expect(contentStatus(asset({ status: "other", dispatchLocked: true, approval: null }))).toEqual({ label: "Draft", tone: "gray" });
  });

  it("lets approval status override asset status", () => {
    expect(
      contentStatus(asset({ status: "approved", dispatchLocked: false, approval: { id: "approval-1", status: "pending_owner_approval" } })),
    ).toEqual({ label: "Review", tone: "amber" });
    expect(contentStatus(asset({ status: "draft", dispatchLocked: true, approval: { id: "approval-1", status: "approved" } }))).toEqual({
      label: "Ready",
      tone: "blue",
    });
    expect(contentStatus(asset({ status: "pending_approval", dispatchLocked: false, approval: { id: "approval-1", status: "approved" } }))).toEqual({
      label: "Ready",
      tone: "blue",
    });
    expect(contentStatus(asset({ status: "approved", dispatchLocked: false, approval: { id: "approval-1", status: "revision_requested" } }))).toEqual({
      label: "Blocked",
      tone: "red",
    });
    expect(contentStatus(asset({ status: "approved", dispatchLocked: false, approval: { id: "approval-1", status: "declined" } }))).toEqual({
      label: "Blocked",
      tone: "red",
    });
    expect(contentStatus(asset({ status: "deployed", dispatchLocked: false, approval: { id: "approval-1", status: "approved" } }))).toEqual({
      label: "Live",
      tone: "green",
    });
  });

  it("maps content to plain destinations", () => {
    expect(contentWhere(asset({ assetType: "email", channel: "email" }))).toBe("Email");
    expect(contentWhere(asset({ assetType: "social_ad", channel: "meta" }))).toBe("Social");
    expect(contentWhere(asset({ assetType: "landing_page", channel: "web" }))).toBe("Website");
    expect(contentWhere(asset({ assetType: "one_pager", channel: "pdf" }))).toBe("Export");
    expect(contentWhere(asset({ assetType: "call_script", channel: "crm" }))).toBe("CRM");
    expect(contentWhere(asset({ assetType: "lead_list", channel: "admin" }))).toBe("CRM");
    expect(contentWhere(asset({ assetType: "campaign_brief", channel: "campaign_brief" }))).toBe("Export");
    expect(contentWhere(asset({ assetType: "crm_lead_list_review", channel: "crm" }))).toBe("CRM");
    expect(contentWhere(asset({ assetType: "partner_lead_list", channel: "crm" }))).toBe("CRM");
    expect(contentWhere(asset({ assetType: "roadshow", channel: "admin" }))).toBe("Export");
  });

  it("builds content rows with next actions", () => {
    expect(buildCampaignContentRows(detail(), "Agent").map((row) => ({ title: row.title, status: row.status.label, where: row.where, nextAction: row.nextAction }))).toEqual([
      { title: "Email draft", status: "Review", where: "Email", nextAction: "Approve or ask Agent to revise" },
      { title: "One-pager", status: "Live", where: "Export", nextAction: "Check results" },
    ]);
  });

  it("marks unlocked approved content live after campaign launch", () => {
    expect(
      buildCampaignContentRows(
        detail({
          assets: [
            asset({
              status: "approved",
              dispatchLocked: false,
              approval: { id: "approval-1", status: "approved" },
            }),
          ],
          launchState: { requiredCount: 1, approvedCount: 1, pendingCount: 0, deployedCount: 1, ready: true, live: true, lifecycle: "Live" },
        }),
        "Agent",
      ).map((row) => ({ status: row.status.label, nextAction: row.nextAction })),
    ).toEqual([{ status: "Live", nextAction: "Check results" }]);
  });

  it("marks individually deployed content live before campaign launch", () => {
    expect(
      buildCampaignContentRows(
        detail({
          assets: [
            asset({
              status: "approved",
              dispatchLocked: false,
              approval: { id: "approval-1", status: "approved" },
            }),
          ],
          launchState: { requiredCount: 1, approvedCount: 1, pendingCount: 0, deployedCount: 1, ready: true, live: false, lifecycle: "Ready" },
        }),
        "Agent",
      ).map((row) => ({ status: row.status, nextAction: row.nextAction })),
    ).toEqual([{ status: { label: "Live", tone: "green" }, nextAction: "Check results" }]);
  });

  it("builds checklist steps from launch state", () => {
    expect(buildCampaignChecklist(detail(), "Agent").map((step) => ({ label: step.label, state: step.state }))).toEqual([
      { label: "Review content", state: "active" },
      { label: "Approve pieces", state: "locked" },
      { label: "Send or export", state: "locked" },
      { label: "Watch results", state: "locked" },
    ]);
  });

  it("keeps empty drafting checklist steps honest", () => {
    expect(
      buildCampaignChecklist(
        detail({
          assets: [],
          launchState: { requiredCount: 0, approvedCount: 0, pendingCount: 0, deployedCount: 0, ready: false, live: false, lifecycle: "Drafting" },
        }),
        "Agent",
      ).map((step) => ({ label: step.label, detail: step.detail, state: step.state })),
    ).toEqual([
      { label: "Review content", detail: "Agent is still building content.", state: "active" },
      { label: "Approve pieces", detail: "Content must be created before approval.", state: "locked" },
      { label: "Send or export", detail: "Approve content first.", state: "locked" },
      { label: "Watch results", detail: "Results appear after sending.", state: "locked" },
    ]);
  });

  it("marks ready checklist send/export as active", () => {
    expect(
      buildCampaignChecklist(
        detail({
          launchState: { requiredCount: 2, approvedCount: 2, pendingCount: 0, deployedCount: 0, ready: true, live: false, lifecycle: "Ready" },
        }),
        "Agent",
      ).map((step) => ({ label: step.label, state: step.state })),
    ).toEqual([
      { label: "Review content", state: "done" },
      { label: "Approve pieces", state: "done" },
      { label: "Send or export", state: "active" },
      { label: "Watch results", state: "locked" },
    ]);
  });

  it("marks live checklist send/export done and results active", () => {
    expect(
      buildCampaignChecklist(
        detail({
          launchState: { requiredCount: 2, approvedCount: 2, pendingCount: 0, deployedCount: 2, ready: true, live: true, lifecycle: "Live" },
        }),
        "Agent",
      ).map((step) => ({ label: step.label, state: step.state })),
    ).toEqual([
      { label: "Review content", state: "done" },
      { label: "Approve pieces", state: "done" },
      { label: "Send or export", state: "done" },
      { label: "Watch results", state: "active" },
    ]);
  });

  it("builds send/export facts", () => {
    expect(buildSendExportFacts(detail())).toEqual([
      { label: "Email", value: "Blocked" },
      { label: "Export", value: "Live" },
    ]);
  });

  it("summarizes the package into readable counts", () => {
    expect(buildCampaignPackageSummary(detail())).toEqual({
      total: 2,
      review: 1,
      ready: 0,
      live: 1,
      draft: 0,
      blocked: 0,
      media: 0,
      destinations: ["Email", "Export"],
    });
  });

  it("builds a simple action hub for campaigns that need review", () => {
    const hub = buildCampaignActionHub(detail(), "Agent", 0);

    expect(hub.title).toBe("1 piece needs your review");
    expect(hub.primaryLabel).toBe("Start reviewing");
    expect(hub.primaryHref).toBe("#content");
    expect(hub.cards.map((card) => ({ key: card.key, value: card.value, href: card.href }))).toEqual([
      { key: "review", value: "1 waiting", href: "#content" },
      { key: "ready", value: "1/2 ready", href: "#send-export" },
      { key: "arc", value: "Available", href: "#arc" },
      { key: "results", value: "Not started", href: "#results" },
    ]);
  });

  it("builds a simple action hub for ready campaigns", () => {
    const hub = buildCampaignActionHub(
      detail({
        launchState: { requiredCount: 2, approvedCount: 2, pendingCount: 0, deployedCount: 0, ready: true, live: false, lifecycle: "Ready" },
      }),
      "Agent",
      0,
    );

    expect(hub.title).toBe("Everything is approved");
    expect(hub.primaryLabel).toBe("Send or export");
    expect(hub.primaryHref).toBe("#send-export");
  });

  it("builds a simple action hub for live campaigns", () => {
    const hub = buildCampaignActionHub(
      detail({
        launchState: { requiredCount: 2, approvedCount: 2, pendingCount: 0, deployedCount: 2, ready: true, live: true, lifecycle: "Live" },
      }),
      "Agent",
      3,
    );

    expect(hub.title).toBe("This campaign is live");
    expect(hub.primaryLabel).toBe("See results");
    expect(hub.cards.find((card) => card.key === "results")?.value).toBe("3 updates");
  });
});
