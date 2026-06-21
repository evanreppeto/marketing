import { describe, expect, it } from "vitest";

import { buildSourceControlData } from "./source-control";

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

describe("buildSourceControlData", () => {
  it("keeps brand sources and excludes low-signal media", () => {
    const data = buildSourceControlData({
      assets: [
        { ...baseAsset, id: "doc", fileName: "Brand Guide.pdf", kind: "document", source: "uploaded", availableToArc: true },
        { ...baseAsset, id: "drive", fileName: "Drive Proof.pdf", kind: "document", source: "google_drive", availableToArc: true },
        { ...baseAsset, id: "url", fileName: "Website Overview", kind: "document", source: "url", availableToArc: true },
        { ...baseAsset, id: "photo", fileName: "crew.jpg", kind: "image", source: "uploaded", availableToArc: true },
      ] as never,
      nodes: [],
    });

    expect(data.assets.map((asset) => asset.id)).toEqual(["doc", "drive", "url"]);
    expect(data.stats.sources).toBe(3);
  });

  it("summarizes blocked, review, trusted, and new source states", () => {
    const data = buildSourceControlData({
      assets: [
        { ...baseAsset, id: "blocked", fileName: "Blocked Brand Guide.pdf", kind: "document", source: "uploaded", availableToArc: false },
        { ...baseAsset, id: "review", fileName: "Review Brand Guide.pdf", kind: "document", source: "uploaded", availableToArc: true },
        { ...baseAsset, id: "trusted", fileName: "Trusted Brand Guide.pdf", kind: "document", source: "uploaded", availableToArc: true },
        { ...baseAsset, id: "new", fileName: "New Brand Guide.pdf", kind: "document", source: "uploaded", availableToArc: true },
      ] as never,
      nodes: [
        { ...baseNode, id: "n-review", kind: "brand_fact", label: "Review me", trustTier: "proposed", refTable: "media_assets", refId: "review" },
        { ...baseNode, id: "n-trusted", kind: "brand_fact", label: "Trust me", trustTier: "trusted", refTable: "media_assets", refId: "trusted" },
      ] as never,
    });

    const statuses = Object.fromEntries(data.assets.map((asset) => [asset.id, asset.status.label]));
    expect(statuses).toMatchObject({
      blocked: "Blocked",
      review: "Review",
      trusted: "Trusted",
      new: "New",
    });
    expect(data.stats).toMatchObject({ blocked: 1, review: 1, ready: 1, learned: 2 });
  });

  it("builds a source-linked Brain review queue", () => {
    const data = buildSourceControlData({
      assets: [
        { ...baseAsset, id: "source-1", fileName: "Case Studies.pdf", kind: "document", source: "google_drive", availableToArc: true },
      ] as never,
      nodes: [
        {
          ...baseNode,
          id: "node-1",
          kind: "proof_point",
          label: "Five star review volume",
          body: "The company has 100 reviews.",
          trustTier: "proposed",
          refTable: "media_assets",
          refId: "source-1",
          confidence: 0.82,
        },
        { ...baseNode, id: "node-2", kind: "brand_fact", label: "Unlinked", trustTier: "proposed", refTable: null, refId: null },
      ] as never,
    });

    expect(data.reviewItems).toEqual([
      expect.objectContaining({
        id: "node-1",
        sourceLabel: "Case Studies.pdf",
        sourceProvider: "Drive",
        confidence: 0.82,
      }),
    ]);
  });

  it("maps saved Drive folder sources into the control center", () => {
    const data = buildSourceControlData({
      assets: [],
      nodes: [],
      driveSources: [
        {
          id: "drive-source-1",
          driveFolderId: "folder-1",
          driveFolderName: "Brand Library",
          libraryFolderId: null,
          status: "error",
          lastSyncedAt: "2026-06-20T12:00:00.000Z",
          lastError: "Access denied",
          lastImportedCount: 0,
        },
      ],
    });

    expect(data.driveSources).toEqual([
      {
        id: "drive-source-1",
        label: "Brand Library",
        status: "error",
        lastSyncedAt: "2026-06-20T12:00:00.000Z",
        lastError: "Access denied",
        lastImportedCount: 0,
      },
    ]);
    expect(data.stats.driveSources).toBe(1);
  });
});
