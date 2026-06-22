import { describe, expect, it } from "vitest";

import { buildBrainSourceReviewData } from "./source-review";

const baseAsset = {
  folderId: null,
  url: "",
  badge: "DOC",
  dimensions: null,
  size: null,
  tags: [],
  riskFlags: [],
  uploadedBy: "operator",
  usedInCount: 0,
};

const baseNode = {
  body: null,
  summary: null,
  persona: null,
  confidence: null,
  source: "brand_source_ingestion",
  tags: [],
  createdBy: "operator",
  createdAt: "2026-06-21T12:00:00.000Z",
};

describe("buildBrainSourceReviewData", () => {
  it("groups proposed Brain nodes by their Library source", () => {
    const data = buildBrainSourceReviewData({
      assets: [
        { ...baseAsset, id: "drive-source", fileName: "Case Studies.pdf", kind: "document", source: "google_drive", availableToArc: true },
        { ...baseAsset, id: "url-source", fileName: "Website Overview", kind: "document", source: "url", availableToArc: true },
      ] as never,
      proposedNodes: [
        {
          ...baseNode,
          id: "node-1",
          kind: "proof_point",
          label: "Review count",
          trustTier: "proposed",
          refTable: "media_assets",
          refId: "drive-source",
        },
        {
          ...baseNode,
          id: "node-2",
          kind: "brand_fact",
          label: "Service area",
          trustTier: "proposed",
          refTable: "media_assets",
          refId: "url-source",
        },
      ] as never,
    });

    expect(data.groups).toEqual([
      expect.objectContaining({
        sourceId: "drive-source",
        sourceLabel: "Case Studies.pdf",
        sourceProvider: "Drive",
        items: [expect.objectContaining({ id: "node-1", label: "Review count" })],
      }),
      expect.objectContaining({
        sourceId: "url-source",
        sourceLabel: "Website Overview",
        sourceProvider: "URL",
        items: [expect.objectContaining({ id: "node-2", label: "Service area" })],
      }),
    ]);
    expect(data.stats).toEqual({ groups: 2, linkedItems: 2, unlinkedItems: 0 });
  });

  it("keeps proposed nodes without a source in the unlinked bucket", () => {
    const data = buildBrainSourceReviewData({
      assets: [
        { ...baseAsset, id: "source-1", fileName: "Brand Guide.pdf", kind: "document", source: "uploaded", availableToArc: true },
      ] as never,
      proposedNodes: [
        { ...baseNode, id: "node-1", kind: "brand_fact", label: "Linked", trustTier: "proposed", refTable: "media_assets", refId: "source-1" },
        { ...baseNode, id: "node-2", kind: "brand_fact", label: "Unlinked", trustTier: "proposed", refTable: null, refId: null },
        { ...baseNode, id: "node-3", kind: "brand_fact", label: "Trusted", trustTier: "trusted", refTable: "media_assets", refId: "source-1" },
      ] as never,
    });

    expect(data.groups).toHaveLength(1);
    expect(data.unlinkedItems).toEqual([expect.objectContaining({ id: "node-2", label: "Unlinked" })]);
    expect(data.stats).toEqual({ groups: 1, linkedItems: 1, unlinkedItems: 1 });
  });

  it("ignores low-signal media assets as source groups", () => {
    const data = buildBrainSourceReviewData({
      assets: [
        { ...baseAsset, id: "photo", fileName: "crew.jpg", kind: "image", source: "uploaded", availableToArc: true },
      ] as never,
      proposedNodes: [
        { ...baseNode, id: "node-1", kind: "brand_fact", label: "Photo fact", trustTier: "proposed", refTable: "media_assets", refId: "photo" },
      ] as never,
    });

    expect(data.groups).toEqual([]);
    expect(data.unlinkedItems).toEqual([expect.objectContaining({ id: "node-1" })]);
  });
});
