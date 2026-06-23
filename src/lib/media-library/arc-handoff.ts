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

/** Compact, model-facing summary of a Library asset Arc may reuse. */
export type ArcMediaSummary = {
  id: string;
  fileName: string;
  url: string;
  kind: string;
  dimensions: string | null;
  tags: string[];
  riskFlags: string[];
  folderId: string | null;
  folderName: string | null;
};

type ArcMediaRow = {
  id: string;
  file_name: string;
  public_url: string;
  storage_path: string;
  kind: string;
  width: number | null;
  height: number | null;
  tags: string[] | null;
  risk_flags: string[] | null;
  folder_id: string | null;
};

/** Pure: media rows → compact Arc summaries, resolving folder names via the map. */
export function toArcMediaSummary(rows: ArcMediaRow[], folderNameById: Map<string, string>): ArcMediaSummary[] {
  return rows.map((r) => ({
    id: r.id,
    fileName: r.file_name,
    url: r.public_url,
    kind: r.kind,
    dimensions: r.width != null && r.height != null ? `${r.width} × ${r.height}` : null,
    tags: r.tags ?? [],
    riskFlags: r.risk_flags ?? [],
    folderId: r.folder_id,
    folderName: r.folder_id ? folderNameById.get(r.folder_id) ?? null : null,
  }));
}

async function loadFolderNames(
  orgId: string, folderIds: string[], client: SupabaseClient,
): Promise<Map<string, string>> {
  if (folderIds.length === 0) return new Map();
  const { data, error } = await client
    .from("media_folders" as string)
    .select("id, name").eq("org_id", orgId).in("id", folderIds);
  if (error) throw new Error(`load folder names failed: ${error.message}`);
  return new Map(((data ?? []) as { id: string; name: string }[]).map((f) => [f.id, f.name]));
}

/** List the org's Library assets that the operator opted into Arc (available_to_arc). */
export async function listAvailableArcMedia(
  orgId: string,
  opts: { kind?: string; folderId?: string; limit?: number } = {},
  client: SupabaseClient = getSupabaseAdminClient(),
): Promise<ArcMediaSummary[]> {
  let query = client
    .from("media_assets" as string)
    .select("id, file_name, public_url, storage_path, kind, width, height, tags, risk_flags, folder_id")
    .eq("org_id", orgId)
    .eq("available_to_arc", true)
    .order("created_at", { ascending: false })
    .limit(Math.min(Math.max(opts.limit ?? 50, 1), 200));
  if (opts.kind) query = query.eq("kind", opts.kind);
  if (opts.folderId) query = query.eq("folder_id", opts.folderId);
  const { data, error } = await query;
  if (error) throw new Error(`list arc media failed: ${error.message}`);
  const rows = (data ?? []) as ArcMediaRow[];
  const folderIds = [...new Set(rows.map((r) => r.folder_id).filter((id): id is string => Boolean(id)))];
  const folderNameById = await loadFolderNames(orgId, folderIds, client);
  return toArcMediaSummary(rows, folderNameById);
}

/** Resolve ONE Arc-available asset (org-scoped) for attaching. Returns null when
 *  the id is unknown, belongs to another org, or is not available_to_arc — so Arc
 *  can never attach an arbitrary URL or a private asset. */
export async function resolveAvailableArcMediaAsset(
  orgId: string,
  assetId: string,
  client: SupabaseClient = getSupabaseAdminClient(),
): Promise<{ id: string; public_url: string; storage_path: string; kind: string; risk_flags: string[] } | null> {
  const { data, error } = await client
    .from("media_assets" as string)
    .select("id, public_url, storage_path, kind, risk_flags")
    .eq("org_id", orgId)
    .eq("id", assetId)
    .eq("available_to_arc", true)
    .maybeSingle();
  if (error) throw new Error(`resolve arc media failed: ${error.message}`);
  if (!data) return null;
  const row = data as { id: string; public_url: string; storage_path: string; kind: string; risk_flags: string[] | null };
  return { ...row, risk_flags: row.risk_flags ?? [] };
}

/** Compact, model-facing summary of a Library folder Arc can organize media into. */
export type ArcFolderSummary = {
  id: string;
  name: string;
  description: string | null;
  parentId: string | null;
  availableAssetCount: number;
};

type ArcFolderRow = { id: string; name: string; description: string | null; parent_id: string | null };

/** Pure: folder rows + the folder_ids of available assets → folder summaries with
 *  available-only counts. Returns every folder (even zero-count) so Arc sees the
 *  full structure and can file into empty folders. */
export function toArcFolderSummaries(folderRows: ArcFolderRow[], availableAssetFolderIds: (string | null)[]): ArcFolderSummary[] {
  const counts = new Map<string, number>();
  for (const fid of availableAssetFolderIds) {
    if (fid) counts.set(fid, (counts.get(fid) ?? 0) + 1);
  }
  return folderRows.map((f) => ({
    id: f.id,
    name: f.name,
    description: f.description ?? null,
    parentId: f.parent_id ?? null,
    availableAssetCount: counts.get(f.id) ?? 0,
  }));
}

/** List the org's Library folders with available-to-Arc asset counts. */
export async function listArcFolders(
  orgId: string, client: SupabaseClient = getSupabaseAdminClient(),
): Promise<ArcFolderSummary[]> {
  const { data: folderData, error: fErr } = await client
    .from("media_folders" as string)
    .select("id, name, description, parent_id").eq("org_id", orgId).order("sort_order");
  if (fErr) throw new Error(`list arc folders failed: ${fErr.message}`);
  const { data: assetData, error: aErr } = await client
    .from("media_assets" as string)
    .select("folder_id").eq("org_id", orgId).eq("available_to_arc", true);
  if (aErr) throw new Error(`list arc folder counts failed: ${aErr.message}`);
  return toArcFolderSummaries(
    (folderData ?? []) as ArcFolderRow[],
    ((assetData ?? []) as { folder_id: string | null }[]).map((r) => r.folder_id),
  );
}
