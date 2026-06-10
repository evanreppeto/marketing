import { describe, expect, it } from "vitest";

import type { CampaignWorkspaceListItem } from "@/lib/campaigns/read-model";
import { momentumCounts, partitionAwaiting } from "../library-model";

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
    previewText: null,
    previewLabel: null,
    updatedAt: "Jun 10",
    updatedAtIso: "2026-06-10T12:00:00Z",
    href: "/campaigns/c1",
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
