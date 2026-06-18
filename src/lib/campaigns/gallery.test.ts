import { describe, expect, it } from "vitest";

import { createSupabaseQueryMock } from "@/lib/repos/__tests__/test-helpers";
import { deriveSourceType, filterGalleryItems, getMediaGallery, normalizeApprovalStatus, type GalleryItem } from "./gallery";

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

function campaignRow(over: Record<string, unknown> = {}) {
  return {
    id: "camp-1", name: "Spring Storm Response", persona: "persona_property_manager",
    restoration_focus: "water_backup", status: "pending_approval", company_id: null,
    contact_id: null, lead_id: null, owner: "Arc", objective: "x", audience_summary: null,
    offer_summary: null, compliance_notes: null, launch_locked: true, source_signal: {},
    source_system: null, reasoning_payload: {}, audit_payload: {},
    created_at: "2026-06-01T00:00:00.000Z", updated_at: "2026-06-01T00:00:00.000Z", ...over,
  };
}
function assetRow(over: Record<string, unknown> = {}) {
  return {
    id: "asset-1", campaign_id: "camp-1", asset_type: "image_prompt", channel: "image",
    title: "Hero", status: "approved", tool_source: "Higgsfield", prompt_input: null,
    prompt_inputs: {}, draft_body: null, edited_body: null, approved_body: null,
    dispatch_locked: true, compliance_notes: null, reasoning_payload: {},
    audit_payload: { media_assets: [{ url: "https://cdn.example/hero.png", type: "image", title: "Hero" }] },
    created_at: "2026-06-02T00:00:00.000Z", updated_at: "2026-06-02T00:00:00.000Z", ...over,
  };
}

describe("getMediaGallery", () => {
  it("returns unavailable when Supabase is not configured", async () => {
    const result = await getMediaGallery();
    expect(result.status).toBe("unavailable");
  });

  it("flattens media across campaigns with provenance, status and a hero set", async () => {
    const supabase = createSupabaseQueryMock({
      campaigns: { data: [campaignRow()], error: null },
      campaign_assets: { data: [assetRow()], error: null },
      approval_items: { data: [], error: null },
      agent_outputs: { data: [], error: null },
    });

    const result = await getMediaGallery(supabase);
    expect(result.status).toBe("live");
    if (result.status !== "live") return;

    expect(result.items).toHaveLength(1);
    const first = result.items[0];
    expect(first.media.url).toBe("https://cdn.example/hero.png");
    expect(first.campaignName).toBe("Spring Storm Response");
    expect(first.sourceType).toBe("ai");        // image_prompt + Higgsfield
    expect(first.approvalStatus).toBe("approved");
    expect(result.totals).toMatchObject({ media: 1, campaigns: 1, approved: 1, ai: 1 });
    // approved image lands in the hero reel
    expect(result.hero.map((h) => h.media.url)).toContain("https://cdn.example/hero.png");
  });

  it("dedupes identical media reused across campaigns and counts usage", async () => {
    const supabase = createSupabaseQueryMock({
      campaigns: { data: [campaignRow({ id: "camp-1" }), campaignRow({ id: "camp-2", name: "Mold Awareness" })], error: null },
      campaign_assets: {
        data: [
          assetRow({ id: "asset-1", campaign_id: "camp-1" }),
          assetRow({ id: "asset-2", campaign_id: "camp-2" }),
        ],
        error: null,
      },
      approval_items: { data: [], error: null },
      agent_outputs: { data: [], error: null },
    });

    const result = await getMediaGallery(supabase);
    expect(result.status).toBe("live");
    if (result.status !== "live") return;
    expect(result.items).toHaveLength(1);
    expect(result.items[0].usedInCount).toBe(2);
  });
});
