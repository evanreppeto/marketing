import { describe, expect, it } from "vitest";

import type { CampaignWorkspaceListItem } from "@/lib/campaigns/read-model";
import {
  campaignManagerSummary,
  campaignManagerStatus,
  campaignManagerWhere,
  campaignDecisionPrompt,
  campaignNextStep,
  campaignPreviewText,
  buildCampaignStartActions,
  campaignAssetKindLabel,
  filterCampaignManagerItems,
  managerViewCounts,
  momentumCounts,
  partitionAwaiting,
  shouldOpenCampaignCard,
  type CampaignManagerView,
} from "../library-model";

const defaultRollup: CampaignWorkspaceListItem["rollup"] = {
  state: "needs_review",
  label: "Needs your review · 1 pending",
  approved: 0,
  pending: 1,
  changes: 0,
  draft: 0,
  total: 1,
};

function item(overrides: Partial<CampaignWorkspaceListItem>): CampaignWorkspaceListItem {
  return {
    id: "c1",
    name: "Campaign",
    persona: "Plumbing Partner",
    status: "In review",
    lifecycle: "In review",
    pendingCount: 1,
    pendingDeliverables: [],
    objective: "",
    audienceSummary: "",
    offerSummary: "",
    whyBuilt: "",
    assetCount: 1,
    approvalCount: 1,
    mediaCount: 0,
    sourceCount: 0,
    thumbnailUrl: null,
    assetTypes: ["Email"],
    driver: "agent",
    channels: ["Email"],
    previewText: null,
    previewLabel: null,
    contentPieces: [],
    updatedAt: "Jun 10",
    updatedAtIso: "2026-06-10T12:00:00Z",
    href: "/campaigns/c1",
    rollup: defaultRollup,
    ...overrides,
  };
}

describe("partitionAwaiting", () => {
  it("splits outbound from internal and sorts each longest-waiting first", () => {
    const items = [
      item({ id: "out-new", assetTypes: ["Email"], updatedAtIso: "2026-06-10T11:00:00Z" }),
      item({ id: "out-old", assetTypes: ["Social Ad"], updatedAtIso: "2026-06-01T11:00:00Z" }),
      item({ id: "int", assetTypes: ["Crm Population Batch"], objective: "populate", updatedAtIso: "2026-06-05T11:00:00Z" }),
    ];
    const { outbound, internal } = partitionAwaiting(items);
    expect(outbound.map((c) => c.id)).toEqual(["out-old", "out-new"]);
    expect(internal.map((c) => c.id)).toEqual(["int"]);
  });

  it("sorts items with unparseable timestamps last", () => {
    const items = [
      item({ id: "bad", assetTypes: ["Email"], updatedAtIso: "nope" }),
      item({ id: "good", assetTypes: ["Email"], updatedAtIso: "2026-06-01T11:00:00Z" }),
    ];
    expect(partitionAwaiting(items).outbound.map((c) => c.id)).toEqual(["good", "bad"]);
  });
});

describe("momentumCounts", () => {
  it("tallies each lifecycle", () => {
    const items = [
      item({ lifecycle: "Live" }),
      item({ lifecycle: "Live" }),
      item({ lifecycle: "In review" }),
      item({ lifecycle: "Drafting" }),
      item({ lifecycle: "Ready" }),
    ];
    expect(momentumCounts(items)).toEqual({ live: 2, awaiting: 1, drafts: 1, ready: 1 });
  });
});

function campaign(overrides: Partial<CampaignWorkspaceListItem> = {}): CampaignWorkspaceListItem {
  return {
    id: overrides.id ?? "campaign-1",
    name: overrides.name ?? "Plumber referral campaign",
    persona: overrides.persona ?? "Persona Plumbing Partner",
    status: overrides.status ?? "Pending approval",
    lifecycle: overrides.lifecycle ?? "In review",
    pendingCount: overrides.pendingCount ?? 2,
    pendingDeliverables: overrides.pendingDeliverables ?? [],
    objective: overrides.objective ?? "Build partner-facing email and one-pager",
    audienceSummary: overrides.audienceSummary ?? "Plumbing partners who find water damage.",
    offerSummary: overrides.offerSummary ?? "Fast documentation and mitigation handoff.",
    whyBuilt: overrides.whyBuilt ?? "Arc found strong referral-fit partners.",
    assetCount: overrides.assetCount ?? 3,
    approvalCount: overrides.approvalCount ?? 2,
    mediaCount: overrides.mediaCount ?? 0,
    sourceCount: overrides.sourceCount ?? 1,
    thumbnailUrl: overrides.thumbnailUrl ?? null,
    assetTypes: overrides.assetTypes ?? ["email", "one_pager", "call_script"],
    driver: overrides.driver ?? "agent",
    channels: overrides.channels ?? ["Email", "Export"],
    previewText: overrides.previewText ?? "Subject: Fast help when plumbing jobs uncover water damage",
    previewLabel: overrides.previewLabel ?? "Email",
    contentPieces: overrides.contentPieces ?? [],
    updatedAt: overrides.updatedAt ?? "Jun 11, 2026, 3:00 PM",
    updatedAtIso: overrides.updatedAtIso ?? "2026-06-11T19:00:00.000Z",
    href: overrides.href ?? "/campaigns/campaign-1",
    rollup: overrides.rollup ?? defaultRollup,
  };
}

describe("campaign manager helpers", () => {
  it.each<[
    CampaignWorkspaceListItem["lifecycle"],
    number,
    ReturnType<typeof campaignManagerStatus>,
  ]>([
    ["In review", 2, { label: "Review needed", tone: "amber" }],
    ["In review", 0, { label: "Ready", tone: "blue" }],
    ["Ready", 0, { label: "Ready", tone: "blue" }],
    ["Live", 1, { label: "Review needed", tone: "amber" }],
    ["Live", 0, { label: "Live", tone: "green" }],
    ["Drafting", 0, { label: "Agent drafting", tone: "gray" }],
  ])("maps lifecycle %s and pending %s to plain status", (lifecycle, pendingCount, expected) => {
    expect(campaignManagerStatus(campaign({ lifecycle, pendingCount }), "Agent")).toEqual(expected);
  });

  it("shows archived display status regardless of lifecycle", () => {
    expect(campaignManagerStatus(campaign({ status: "Archived", lifecycle: "Live", pendingCount: 0 }), "Agent")).toEqual({
      label: "Archived",
      tone: "gray",
    });
  });

  it("summarizes content with review count", () => {
    expect(campaignManagerSummary(campaign({ assetCount: 3, pendingCount: 2 }), "Agent")).toEqual({
      primary: "3 pieces",
      secondary: "2 need review",
    });
  });

  it("uses all-approved copy when no pieces need review", () => {
    expect(campaignManagerSummary(campaign({ assetCount: 3, pendingCount: 0 }), "Agent")).toEqual({
      primary: "3 pieces",
      secondary: "all approved",
    });
  });

  it("maps asset types to plain where labels", () => {
    expect(campaignManagerWhere(campaign({ assetTypes: ["email", "social_ad", "landing_page", "one_pager"] }))).toEqual([
      "Email",
      "Social",
      "Website",
      "Export",
    ]);
  });

  it("maps humanized asset types from the read model to plain where labels", () => {
    expect(campaignManagerWhere(campaign({ assetTypes: ["Email", "Social Ad", "Landing Page", "One Pager"] }))).toEqual([
      "Email",
      "Social",
      "Website",
      "Export",
    ]);
  });

  it("maps internal campaign asset names to plain where labels", () => {
    expect(
      campaignManagerWhere(
        campaign({
          assetTypes: ["Campaign Brief", "CRM Lead List Review", "CRM Population Batch", "Partner Lead List"],
        }),
      ),
    ).toEqual(["Export", "CRM"]);
  });

  it("derives the next step in plain language", () => {
    expect(campaignNextStep(campaign({ lifecycle: "In review", pendingCount: 2 }), "Agent")).toBe("Review 2 pieces");
    expect(campaignNextStep(campaign({ lifecycle: "Ready", pendingCount: 0 }), "Agent")).toBe("Send or export");
    expect(campaignNextStep(campaign({ lifecycle: "Live", pendingCount: 0 }), "Agent")).toBe("Check results");
    expect(campaignNextStep(campaign({ lifecycle: "Drafting", pendingCount: 0 }), "Agent")).toBe("Wait for Agent");
  });

  it("explains what the user needs to decide", () => {
    expect(campaignDecisionPrompt(campaign({ lifecycle: "In review", pendingCount: 2 }), "Agent")).toBe(
      "Decide whether to approve, revise, or hold these pieces.",
    );
    expect(campaignDecisionPrompt(campaign({ lifecycle: "Ready", pendingCount: 0 }), "Agent")).toBe(
      "Choose where this campaign should be handed off.",
    );
    expect(campaignDecisionPrompt(campaign({ lifecycle: "Live", pendingCount: 0 }), "Agent")).toBe("Watch replies, dispatches, and outcomes.");
    expect(campaignDecisionPrompt(campaign({ lifecycle: "Drafting", pendingCount: 0 }), "Agent")).toBe(
      "Add guidance for Agent if the campaign needs a different direction.",
    );
  });

  it("uses the real preview text when one exists", () => {
    expect(campaignPreviewText(campaign({ previewLabel: "Email", previewText: "Subject: We can help" }), "Agent")).toEqual({
      label: "Email",
      text: "Subject: We can help",
    });
  });

  it("falls back to why Arc built it when no preview text exists", () => {
    expect(campaignPreviewText(campaign({ previewText: "", previewLabel: "", whyBuilt: "Arc found a strong partner fit." }), "Agent")).toEqual({
      label: "Why this exists",
      text: "Arc found a strong partner fit.",
    });
  });

  it("builds start-here action cards", () => {
    const actions = buildCampaignStartActions([
      campaign({ id: "review", lifecycle: "In review", pendingCount: 2 }),
      campaign({ id: "ready", lifecycle: "Ready", pendingCount: 0 }),
      campaign({ id: "draft", lifecycle: "Drafting", pendingCount: 0 }),
      campaign({ id: "live", lifecycle: "Live", pendingCount: 0 }),
    ], "Agent");

    expect(actions.map((action) => ({ key: action.key, count: action.count, cta: action.cta, tone: action.tone }))).toEqual([
      { key: "needs-attention", count: 1, cta: "Start reviewing", tone: "amber" },
      { key: "ready-to-send", count: 1, cta: "View ready", tone: "blue" },
      { key: "arc-working", count: 1, cta: "Check drafts", tone: "blue" },
      { key: "live", count: 1, cta: "View live", tone: "green" },
    ]);
    expect(actions[0].detail).toBe("2 pieces need a yes, a revision note, or a hold.");
  });

  it("uses plain labels for deliverable kinds", () => {
    expect(campaignAssetKindLabel("campaign_brief")).toBe("Export");
    expect(campaignAssetKindLabel("crm_gap_fill_review")).toBe("CRM");
    expect(campaignAssetKindLabel("handoff-note")).toBe("Handoff Note");
  });

  it("filters saved views", () => {
    const items = [
      campaign({ id: "review", lifecycle: "In review", pendingCount: 1 }),
      campaign({ id: "ready", lifecycle: "Ready", pendingCount: 0 }),
      campaign({ id: "live", lifecycle: "Live", pendingCount: 0 }),
      campaign({ id: "draft", lifecycle: "Drafting", pendingCount: 0 }),
    ];

    expect(filterCampaignManagerItems(items, "needs-attention").map((campaignItem) => campaignItem.id)).toEqual(["review"]);
    expect(filterCampaignManagerItems(items, "ready-to-send").map((campaignItem) => campaignItem.id)).toEqual(["ready"]);
    expect(filterCampaignManagerItems(items, "arc-working").map((campaignItem) => campaignItem.id)).toEqual(["draft"]);
    expect(filterCampaignManagerItems(items, "live").map((campaignItem) => campaignItem.id)).toEqual(["live"]);
    expect(filterCampaignManagerItems(items, "all").map((campaignItem) => campaignItem.id)).toEqual(["review", "ready", "live", "draft"]);
  });

  it("searches campaign text, audience, channels, and destinations", () => {
    const items = [
      campaign({ id: "plumber", name: "Plumber referral campaign", audienceSummary: "Plumbing partners", assetTypes: ["email"] }),
      campaign({ id: "storm", name: "Storm response ads", persona: "Persona Homeowner", audienceSummary: "Homeowners", assetTypes: ["social_ad"] }),
      campaign({
        id: "mail",
        name: "Homeowner follow-up",
        persona: "Persona Homeowner",
        audienceSummary: "Recent customers",
        assetTypes: ["Email"],
        channels: ["Direct Mail"],
      }),
    ];

    expect(filterCampaignManagerItems(items, "all", "plumbing").map((campaignItem) => campaignItem.id)).toEqual(["plumber"]);
    expect(filterCampaignManagerItems(items, "all", "social").map((campaignItem) => campaignItem.id)).toEqual(["storm"]);
    expect(filterCampaignManagerItems(items, "all", "direct mail").map((campaignItem) => campaignItem.id)).toEqual(["mail"]);
  });

  it("counts manager views", () => {
    const counts = managerViewCounts([
      campaign({ id: "review", lifecycle: "In review", pendingCount: 1 }),
      campaign({ id: "ready", lifecycle: "Ready", pendingCount: 0 }),
      campaign({ id: "live", lifecycle: "Live", pendingCount: 0 }),
      campaign({ id: "draft", lifecycle: "Drafting", pendingCount: 0 }),
      campaign({ id: "archived", status: "Archived", lifecycle: "Live", pendingCount: 0 }),
    ]);

    expect(counts satisfies Record<CampaignManagerView, number>).toEqual({
      "needs-attention": 1,
      all: 5,
      "ready-to-send": 1,
      "arc-working": 1,
      live: 1,
      archived: 1,
    });
  });

  it("filters archived campaigns", () => {
    const items = [
      campaign({ id: "active", status: "Pending approval", lifecycle: "Ready", pendingCount: 0 }),
      campaign({ id: "archived", status: "Archived", lifecycle: "Live", pendingCount: 0 }),
    ];

    expect(filterCampaignManagerItems(items, "archived").map((campaignItem) => campaignItem.id)).toEqual(["archived"]);
  });

  it("keeps archived campaigns in all and archived, but excludes them from active views", () => {
    const items = [
      campaign({ id: "active-live", status: "Live", lifecycle: "Live", pendingCount: 0 }),
      campaign({ id: "active-review", status: "Pending approval", lifecycle: "In review", pendingCount: 1 }),
      campaign({ id: "archived-live", status: "Archived", lifecycle: "Live", pendingCount: 1 }),
    ];

    expect(filterCampaignManagerItems(items, "archived").map((campaignItem) => campaignItem.id)).toEqual(["archived-live"]);
    expect(filterCampaignManagerItems(items, "all").map((campaignItem) => campaignItem.id)).toEqual([
      "active-live",
      "active-review",
      "archived-live",
    ]);
    expect(filterCampaignManagerItems(items, "live").map((campaignItem) => campaignItem.id)).toEqual(["active-live"]);
    expect(filterCampaignManagerItems(items, "needs-attention").map((campaignItem) => campaignItem.id)).toEqual(["active-review"]);

    expect(managerViewCounts(items).archived).toBe(1);
    expect(managerViewCounts(items).all).toBe(3);
    expect(managerViewCounts(items).live).toBe(1);
    expect(managerViewCounts(items)["needs-attention"]).toBe(1);
  });

  it("opens the only campaign or campaigns needing review by default", () => {
    expect(shouldOpenCampaignCard(campaign({ pendingCount: 0, lifecycle: "Ready" }), 1)).toBe(true);
    expect(shouldOpenCampaignCard(campaign({ pendingCount: 2, lifecycle: "In review" }), 5)).toBe(true);
    expect(shouldOpenCampaignCard(campaign({ pendingCount: 0, lifecycle: "Ready" }), 5)).toBe(false);
  });
});
