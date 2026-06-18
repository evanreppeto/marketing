import type { CampaignMediaAsset } from "./read-model";

export type GallerySourceType = "real" | "ai";
export type GalleryApprovalStatus = "approved" | "pending" | "rejected" | "draft";

export type GalleryItem = {
  media: CampaignMediaAsset;
  campaignId: string;
  campaignName: string;
  assetType: string;
  approvalStatus: GalleryApprovalStatus;
  sourceType: GallerySourceType;
  format: string | null;
  updatedAtIso: string;
  usedInCount: number;
};

export type GalleryTypeFilter = "all" | "images" | "video" | "docs";
export type GalleryProvenanceFilter = "all" | "real" | "ai";
export type GalleryStatusFilter = "all" | "approved" | "pending";

export type GalleryFilters = {
  type: GalleryTypeFilter;
  provenance: GalleryProvenanceFilter;
  status: GalleryStatusFilter;
};

function matchesType(mediaType: CampaignMediaAsset["type"], filter: GalleryTypeFilter): boolean {
  switch (filter) {
    case "all":
      return true;
    case "images":
      return mediaType === "image";
    case "video":
      return mediaType === "video" || mediaType === "embed";
    case "docs":
      return mediaType === "file";
  }
}

export function filterGalleryItems(items: GalleryItem[], filters: GalleryFilters): GalleryItem[] {
  return items.filter((item) => {
    if (!matchesType(item.media.type, filters.type)) return false;
    if (filters.provenance !== "all" && item.sourceType !== filters.provenance) return false;
    if (filters.status !== "all" && item.approvalStatus !== filters.status) return false;
    return true;
  });
}

export function normalizeApprovalStatus(status: string): GalleryApprovalStatus {
  switch (status) {
    case "approved":
      return "approved";
    case "pending_approval":
    case "pending_owner_approval":
    case "needs_compliance":
      return "pending";
    case "declined":
    case "rejected":
    case "blocked":
      return "rejected";
    default:
      // draft, needs_revision, revision_requested, archived, unknown
      return "draft";
  }
}

const AI_TOOL_PATTERN = /higgsfield|dall|midjourney|stable\s*diffusion|sdxl|imagen|firefly|generat|\bai\b/i;

export function deriveSourceType(assetType: string, toolSource: string | null): GallerySourceType {
  if (assetType === "image_prompt" || assetType === "video_prompt") return "ai";
  if (toolSource && AI_TOOL_PATTERN.test(toolSource)) return "ai";
  return "real";
}
