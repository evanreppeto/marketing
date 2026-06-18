export type GallerySourceType = "real" | "ai";
export type GalleryApprovalStatus = "approved" | "pending" | "rejected" | "draft";

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
