import { type SupabaseClient } from "@supabase/supabase-js";

import { getSupabaseAdminClient } from "@/lib/supabase/server";

const BUCKET = "campaign-media";

/** Bypass Supabase generated-type narrowing for tables added in later migrations
 *  (media_folders, media_assets). Mirrors the insertOne/insertNoReturn pattern
 *  in src/lib/campaigns/create.ts — passing a `string`-typed variable to
 *  `client.from()` prevents TypeScript from narrowing to a specific schema key. */
async function insertGetId(
  client: SupabaseClient,
  table: string,
  values: Record<string, unknown>,
): Promise<string> {
  const { data, error } = await client.from(table).insert(values).select("id").single();
  if (error) throw new Error(`${table} insert failed: ${error.message}`);
  if (!data?.id) throw new Error(`${table} insert did not return an id`);
  return data.id as string;
}

async function updateRow(
  client: SupabaseClient,
  table: string,
  values: Record<string, unknown>,
  id: string,
): Promise<void> {
  const { error } = await client.from(table).update(values).eq("id", id);
  if (error) throw new Error(`${table} update failed: ${error.message}`);
}

async function deleteRow(client: SupabaseClient, table: string, id: string): Promise<void> {
  const { error } = await client.from(table).delete().eq("id", id);
  if (error) throw new Error(`${table} delete failed: ${error.message}`);
}

export function sanitizeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "file";
  const dot = base.lastIndexOf(".");
  const stem = (dot > 0 ? base.slice(0, dot) : base).replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  const ext = dot > 0 ? base.slice(dot + 1).replace(/[^a-zA-Z0-9]+/g, "") : "";
  return ext ? `${stem || "file"}.${ext}` : stem || "file";
}

export function buildStoragePath(orgId: string, assetId: string, fileName: string): string {
  return `library/${orgId}/${assetId}-${sanitizeFileName(fileName)}`;
}

export type ImageUploader = (path: string, bytes: Uint8Array, contentType: string) => Promise<string>;

export function defaultUploader(client: SupabaseClient): ImageUploader {
  return async (path, bytes, contentType) => {
    const { error } = await client.storage.from(BUCKET).upload(path, bytes, { contentType, upsert: true });
    if (error) throw new Error(`media upload failed: ${error.message}`);
    return client.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  };
}

export type CreateFolderInput = { orgId: string; name: string; client?: SupabaseClient };
export async function createFolder({ orgId, name, client = getSupabaseAdminClient() }: CreateFolderInput): Promise<string> {
  return insertGetId(client, "media_folders", { org_id: orgId, name });
}

export async function renameFolder(id: string, name: string, client: SupabaseClient = getSupabaseAdminClient()) {
  await updateRow(client, "media_folders", { name }, id);
}

export async function deleteFolder(id: string, client: SupabaseClient = getSupabaseAdminClient()) {
  await deleteRow(client, "media_folders", id);
}

export type InsertAssetInput = {
  orgId: string;
  folderId: string | null;
  fileName: string;
  bytes: Uint8Array;
  contentType: string;
  kind: string;
  width?: number | null;
  height?: number | null;
  byteSize: number;
  source?: string;
  uploadedBy: string;
  client?: SupabaseClient;
  uploader?: ImageUploader;
};

/** Insert the media_assets row (placeholder path), upload the bytes, then update
 *  the row with the real storage path + public URL. Returns the new id.
 *
 *  Non-transactional (Supabase JS has no multi-table transaction): if the upload
 *  throws, the row is left with a "pending" path; if the final update throws, a
 *  storage object exists with no row reference. Acceptable for this iteration —
 *  uploads are low-frequency and a cleanup pass can be added if it matters.
 *  Mirrors the same documented tradeoff in src/lib/campaigns/create.ts. */
export async function insertAsset(input: InsertAssetInput): Promise<string> {
  const client = input.client ?? getSupabaseAdminClient();
  const upload = input.uploader ?? defaultUploader(client);
  const id = await insertGetId(client, "media_assets", {
    org_id: input.orgId, folder_id: input.folderId, file_name: input.fileName,
    storage_path: "pending", public_url: "pending", content_type: input.contentType, kind: input.kind,
    width: input.width ?? null, height: input.height ?? null, byte_size: input.byteSize,
    source: input.source ?? "uploaded", uploaded_by: input.uploadedBy,
  });
  const path = buildStoragePath(input.orgId, id, input.fileName);
  const url = await upload(path, input.bytes, input.contentType);
  await updateRow(client, "media_assets", { storage_path: path, public_url: url }, id);
  return id;
}

export async function renameAsset(id: string, fileName: string, client: SupabaseClient = getSupabaseAdminClient()) {
  await updateRow(client, "media_assets", { file_name: fileName }, id);
}

export async function moveAsset(id: string, folderId: string | null, client: SupabaseClient = getSupabaseAdminClient()) {
  await updateRow(client, "media_assets", { folder_id: folderId }, id);
}

export async function setAssetTags(id: string, tags: string[], client: SupabaseClient = getSupabaseAdminClient()) {
  await updateRow(client, "media_assets", { tags }, id);
}

export async function setAvailableToArc(id: string, value: boolean, client: SupabaseClient = getSupabaseAdminClient()) {
  await updateRow(client, "media_assets", { available_to_arc: value }, id);
}

export async function deleteAsset(id: string, client: SupabaseClient = getSupabaseAdminClient()) {
  const { data, error } = await client.from("media_assets" as string).select("storage_path").eq("id", id).maybeSingle();
  if (error) throw new Error(`delete lookup failed: ${error.message}`);
  const path = (data as { storage_path?: string } | null)?.storage_path;
  // Skip the "pending" placeholder left by a failed upload — there's no object to remove.
  if (path && path !== "pending") {
    const { error: removeError } = await client.storage.from(BUCKET).remove([path]);
    // Don't block the row delete on a storage miss (object may already be gone),
    // but surface other failures so partial-delete problems are visible.
    if (removeError && !/not.?found|does not exist/i.test(removeError.message)) {
      throw new Error(`storage remove failed: ${removeError.message}`);
    }
  }
  await deleteRow(client, "media_assets", id);
}
