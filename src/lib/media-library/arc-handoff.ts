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
};

/** Pure: media rows → compact Arc summaries. */
export function toArcMediaSummary(rows: ArcMediaRow[]): ArcMediaSummary[] {
  return rows.map((r) => ({
    id: r.id,
    fileName: r.file_name,
    url: r.public_url,
    kind: r.kind,
    dimensions: r.width && r.height ? `${r.width} × ${r.height}` : null,
    tags: r.tags ?? [],
    riskFlags: r.risk_flags ?? [],
  }));
}

/** List the org's Library assets that the operator opted into Arc (available_to_arc). */
export async function listAvailableArcMedia(
  orgId: string,
  opts: { kind?: string; limit?: number } = {},
  client: SupabaseClient = getSupabaseAdminClient(),
): Promise<ArcMediaSummary[]> {
  let query = client
    .from("media_assets" as string)
    .select("id, file_name, public_url, storage_path, kind, width, height, tags, risk_flags")
    .eq("org_id", orgId)
    .eq("available_to_arc", true)
    .order("created_at", { ascending: false })
    .limit(Math.min(Math.max(opts.limit ?? 50, 1), 200));
  if (opts.kind) query = query.eq("kind", opts.kind);
  const { data, error } = await query;
  if (error) throw new Error(`list arc media failed: ${error.message}`);
  return toArcMediaSummary((data ?? []) as ArcMediaRow[]);
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
