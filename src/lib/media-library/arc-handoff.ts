import { type SupabaseClient } from "@supabase/supabase-js";

import { type ArcAttachment } from "@/lib/arc-chat/persistence";
import { getSupabaseAdminClient } from "@/lib/supabase/server";

type AttachableAsset = { public_url: string; storage_path: string; content_type: string; file_name: string };

/** Pure: library asset rows → ArcAttachment[]. Library media is already a public
 *  URL, so unlike composer uploads it needs no GCS signing. */
export function toArcAttachments(assets: AttachableAsset[]): ArcAttachment[] {
  return assets.map((a) => ({
    url: a.public_url, objectPath: a.storage_path, contentType: a.content_type, name: a.file_name,
  }));
}

/** Load the selected assets (org-scoped) and return ArcAttachments. */
export async function loadArcAttachments(
  orgId: string, assetIds: string[], client: SupabaseClient = getSupabaseAdminClient(),
): Promise<ArcAttachment[]> {
  if (assetIds.length === 0) return [];
  const { data, error } = await client
    .from("media_assets" as string)
    .select("public_url, storage_path, content_type, file_name")
    .eq("org_id", orgId).in("id", assetIds);
  if (error) throw new Error(`load attachments failed: ${error.message}`);
  return toArcAttachments((data ?? []) as AttachableAsset[]);
}
