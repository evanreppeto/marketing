import { type SupabaseClient } from "@supabase/supabase-js";

import { formatByteSize } from "@/domain";
import { getCurrentOrgId, OrgUnavailableError } from "@/lib/auth/org";
import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/server";

import { type MediaAssetRow, type MediaAssetView, type MediaFolderView, type MediaLibraryData } from "./types";

/** Pure: one DB row → view model. `usedIn` is the count of campaign assets referencing it. */
export function toAssetView(row: MediaAssetRow, usedIn: number): MediaAssetView {
  const badge =
    row.source === "ai_generated" ? "AI" : row.kind === "logo" ? "LOGO" : row.kind === "video" ? "VIDEO" : "PHOTO";
  return {
    id: row.id,
    folderId: row.folder_id,
    fileName: row.file_name,
    url: row.public_url,
    kind: row.kind,
    badge,
    dimensions: row.width && row.height ? `${row.width} × ${row.height}` : null,
    size: row.byte_size != null ? formatByteSize(row.byte_size) : null,
    source: row.source,
    tags: row.tags ?? [],
    riskFlags: row.risk_flags ?? [],
    availableToArc: row.available_to_arc,
    uploadedBy: row.uploaded_by,
    usedInCount: usedIn,
  };
}

/** Count, per library asset, how many campaign assets reference it. */
export function countUsage(
  assets: Pick<MediaAssetRow, "id" | "storage_path" | "public_url">[],
  campaignMedia: Array<{ path?: string; url?: string; library_asset_id?: string }>,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const a of assets) {
    const n = campaignMedia.filter(
      (m) => m.library_asset_id === a.id || m.path === a.storage_path || m.url === a.public_url,
    ).length;
    counts.set(a.id, n);
  }
  return counts;
}

export async function getMediaLibraryData(client?: SupabaseClient): Promise<MediaLibraryData> {
  if (!client && !isSupabaseAdminConfigured()) {
    return { status: "unavailable", message: "Supabase env vars are not configured." };
  }
  const db = client ?? getSupabaseAdminClient();
  let orgId: string;
  try {
    orgId = await getCurrentOrgId();
  } catch (error) {
    if (error instanceof OrgUnavailableError) return { status: "unavailable", message: error.message };
    throw error;
  }

  const { data: folderRows, error: fErr } = await db
    .from("media_folders").select("id, name").eq("org_id", orgId).order("sort_order");
  if (fErr) return { status: "unavailable", message: fErr.message };

  const { data: assetRows, error: aErr } = await db
    .from("media_assets").select("*").eq("org_id", orgId).order("created_at", { ascending: false });
  if (aErr) return { status: "unavailable", message: aErr.message };
  const assets = (assetRows ?? []) as MediaAssetRow[];

  const { data: caRows } = await db.from("campaign_assets").select("audit_payload");
  const campaignMedia: Array<{ path?: string; url?: string; library_asset_id?: string }> = [];
  for (const ca of (caRows ?? []) as Array<{ audit_payload: { media_assets?: unknown[] } }>) {
    for (const m of ca.audit_payload?.media_assets ?? []) {
      if (m && typeof m === "object") campaignMedia.push(m as Record<string, never>);
    }
  }
  const usage = countUsage(assets, campaignMedia);

  const counts = new Map<string | null, number>();
  for (const a of assets) counts.set(a.folder_id, (counts.get(a.folder_id) ?? 0) + 1);

  const folders: MediaFolderView[] = [
    { id: "all", name: "All media", count: assets.length },
    ...((folderRows ?? []) as Array<{ id: string; name: string }>).map((f) => ({
      id: f.id, name: f.name, count: counts.get(f.id) ?? 0,
    })),
  ];

  return {
    status: "live",
    folders,
    assets: assets.map((a) => toAssetView(a, usage.get(a.id) ?? 0)),
    totalBytes: assets.reduce((sum, a) => sum + (a.byte_size ?? 0), 0),
  };
}
