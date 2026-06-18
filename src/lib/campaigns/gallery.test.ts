import { describe, expect, it } from "vitest";

import { deriveSourceType, filterGalleryItems, normalizeApprovalStatus, type GalleryItem } from "./gallery";

describe("normalizeApprovalStatus", () => {
  it("maps the approval_status enum to the four UI buckets", () => {
    expect(normalizeApprovalStatus("approved")).toBe("approved");
    expect(normalizeApprovalStatus("pending_approval")).toBe("pending");
    expect(normalizeApprovalStatus("pending_owner_approval")).toBe("pending");
    expect(normalizeApprovalStatus("needs_compliance")).toBe("pending");
    expect(normalizeApprovalStatus("declined")).toBe("rejected");
    expect(normalizeApprovalStatus("rejected")).toBe("rejected");
    expect(normalizeApprovalStatus("blocked")).toBe("rejected");
    expect(normalizeApprovalStatus("draft")).toBe("draft");
    expect(normalizeApprovalStatus("needs_revision")).toBe("draft");
    expect(normalizeApprovalStatus("archived")).toBe("draft");
    expect(normalizeApprovalStatus("something_unknown")).toBe("draft");
  });
});

describe("deriveSourceType", () => {
  it("flags prompt-driven asset types as AI-generated", () => {
    expect(deriveSourceType("image_prompt", null)).toBe("ai");
    expect(deriveSourceType("video_prompt", null)).toBe("ai");
  });

  it("flags generator tools as AI-generated", () => {
    expect(deriveSourceType("social_ad", "Higgsfield")).toBe("ai");
    expect(deriveSourceType("social_ad", "DALL-E pipeline")).toBe("ai");
  });

  it("treats everything else as real BSR media", () => {
    expect(deriveSourceType("social_ad", "Arc Orchestrator")).toBe("real");
    expect(deriveSourceType("one_pager", null)).toBe("real");
  });
});

function item(partial: Partial<GalleryItem>): GalleryItem {
  return {
    media: { id: "m1", type: "image", title: "t", url: "https://x/a.png", thumbnailUrl: null, mimeType: null, description: null, source: "s" },
    campaignId: "c1",
    campaignName: "Campaign",
    assetType: "social_ad",
    approvalStatus: "approved",
    sourceType: "real",
    format: null,
    updatedAtIso: "2026-06-01T00:00:00.000Z",
    usedInCount: 1,
    ...partial,
  };
}

describe("filterGalleryItems", () => {
  const items = [
    item({ media: { id: "a", type: "image", title: "a", url: "https://x/a.png", thumbnailUrl: null, mimeType: null, description: null, source: "s" }, sourceType: "real", approvalStatus: "approved" }),
    item({ media: { id: "b", type: "video", title: "b", url: "https://x/b.mp4", thumbnailUrl: null, mimeType: null, description: null, source: "s" }, sourceType: "ai", approvalStatus: "pending" }),
    item({ media: { id: "c", type: "file", title: "c", url: "https://x/c.pdf", thumbnailUrl: null, mimeType: null, description: null, source: "s" }, sourceType: "real", approvalStatus: "approved" }),
  ];

  it("returns everything when filters are 'all'", () => {
    expect(filterGalleryItems(items, { type: "all", provenance: "all", status: "all" })).toHaveLength(3);
  });

  it("filters by media type group (images only)", () => {
    const out = filterGalleryItems(items, { type: "images", provenance: "all", status: "all" });
    expect(out.map((i) => i.media.id)).toEqual(["a"]);
  });

  it("filters by provenance", () => {
    const out = filterGalleryItems(items, { type: "all", provenance: "ai", status: "all" });
    expect(out.map((i) => i.media.id)).toEqual(["b"]);
  });

  it("filters by status and combines filters", () => {
    const out = filterGalleryItems(items, { type: "all", provenance: "real", status: "approved" });
    expect(out.map((i) => i.media.id)).toEqual(["a", "c"]);
  });
});
