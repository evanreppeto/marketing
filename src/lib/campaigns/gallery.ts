import { type SupabaseClient } from "@supabase/supabase-js";

import {
  ASSET_SELECT,
  CAMPAIGN_SELECT,
  assertSupabaseResult,
  collectMediaFromAsset,
  collectMediaFromCampaign,
  selectIn,
  type CampaignAssetRow,
  type CampaignMediaAsset,
  type CampaignRow,
} from "./read-model";
import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "../supabase/server";

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

export type MediaGallery =
  | { status: "unavailable"; message: string }
  | {
      status: "live";
      items: GalleryItem[];
      hero: GalleryItem[];
      totals: { media: number; campaigns: number; approved: number; ai: number };
    };

const HERO_MAX = 6;

export async function getMediaGallery(client?: SupabaseClient): Promise<MediaGallery> {
  if (!client && !isSupabaseAdminConfigured()) {
    return { status: "unavailable", message: "Supabase env vars are not configured." };
  }

  try {
    const supabase = client ?? getSupabaseAdminClient();
    const { data, error } = await supabase
      .from("campaigns")
      .select(CAMPAIGN_SELECT)
      .order("updated_at", { ascending: false })
      .limit(100);
    assertSupabaseResult("campaigns", error);

    const campaigns = (data ?? []) as CampaignRow[];
    const campaignIds = campaigns.map((c) => c.id);
    const assets = await selectIn<CampaignAssetRow>(supabase, "campaign_assets", ASSET_SELECT, "campaign_id", campaignIds, "updated_at");

    // Flatten per-asset media (carries the asset's provenance + status), then
    // campaign-level media (no owning asset → treated as real, status "approved"
    // only insofar as it is reference media; we mark it "draft" to avoid implying
    // an approval it never had).
    const collected: GalleryItem[] = [];

    for (const asset of assets) {
      const owner = campaigns.find((c) => c.id === asset.campaign_id);
      if (!owner) continue;
      for (const media of collectMediaFromAsset(asset)) {
        collected.push({
          media,
          campaignId: owner.id,
          campaignName: owner.name,
          assetType: asset.asset_type,
          approvalStatus: normalizeApprovalStatus(asset.status),
          sourceType: deriveSourceType(asset.asset_type, asset.tool_source),
          format: asset.channel ?? null,
          updatedAtIso: asset.updated_at,
          usedInCount: 1,
        });
      }
    }

    for (const campaign of campaigns) {
      for (const media of collectMediaFromCampaign(campaign)) {
        collected.push({
          media,
          campaignId: campaign.id,
          campaignName: campaign.name,
          assetType: "campaign",
          approvalStatus: "draft",
          sourceType: "real",
          format: null,
          updatedAtIso: campaign.updated_at,
          usedInCount: 1,
        });
      }
    }

    // Dedupe by media URL, keeping the newest occurrence and counting reuse.
    const byUrl = new Map<string, GalleryItem>();
    for (const entry of collected) {
      const key = entry.media.url;
      const existing = byUrl.get(key);
      if (!existing) {
        byUrl.set(key, { ...entry });
        continue;
      }
      existing.usedInCount += 1;
      if (entry.updatedAtIso > existing.updatedAtIso) {
        byUrl.set(key, { ...entry, usedInCount: existing.usedInCount });
      }
    }

    const items = [...byUrl.values()].sort((a, b) => b.updatedAtIso.localeCompare(a.updatedAtIso));

    const hero = items
      .filter((i) => i.approvalStatus === "approved" && (i.media.type === "image" || i.media.type === "video"))
      .slice(0, HERO_MAX);

    return {
      status: "live",
      items,
      hero,
      totals: {
        media: items.length,
        campaigns: new Set(items.map((i) => i.campaignId)).size,
        approved: items.filter((i) => i.approvalStatus === "approved").length,
        ai: items.filter((i) => i.sourceType === "ai").length,
      },
    };
  } catch (error) {
    return { status: "unavailable", message: error instanceof Error ? error.message : "The media gallery is unavailable." };
  }
}
