"use server";

import { revalidatePath } from "next/cache";

import { getOperatorActor, requireOperator } from "@/lib/auth/operator";
import { getCurrentOrgId } from "@/lib/auth/org";
import { removeMediaRecordFromBrain, syncMediaRecordToBrain } from "@/lib/brain-ingestion/sync";
import { createFolder, deleteAsset, deleteFolder, insertAssetWithUrl, renameAsset, renameFolder, setAssetTags, setAvailableToArc } from "@/lib/media-library/persistence";
import { MAX_UPLOAD_BYTES, acceptUpload, kindForContentType } from "@/lib/media-library/upload-policy";
import { scanMediaIngest } from "@/lib/media-library/ingest-intelligence";
import { fetchRemoteMedia } from "@/lib/media-library/fetch-remote";
import { isSupabaseAdminConfigured } from "@/lib/supabase/server";

import { type Asset } from "./_components/library-view";

/**
 * Real operator write for the Library "New folder" button. A folder is internal
 * organization (never outbound), so it persists directly through
 * requireOperator() + the org-scoped createFolder. `persisted: false` is the
 * honest offline signal so the tree can show it optimistically.
 */
export type CreateFolderResult =
  | { ok: true; persisted: boolean; id?: string }
  | { ok: false; error: string };

export async function createLibraryFolder(name: string): Promise<CreateFolderResult> {
  await requireOperator();

  const trimmed = name?.trim();
  if (!trimmed) return { ok: false, error: "A folder name is required." };

  if (!isSupabaseAdminConfigured()) return { ok: true, persisted: false };

  try {
    const orgId = await getCurrentOrgId();
    const id = await createFolder({ orgId, name: trimmed });
    revalidatePath("/library");
    return { ok: true, persisted: true, id };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not create the folder." };
  }
}

export type FolderMutationResult = { ok: true; persisted: boolean } | { ok: false; error: string };

/** Rename a folder. Org-scoped (renameFolder returns false when the id isn't this
 *  workspace's row). Internal organization — never outbound. */
export async function renameLibraryFolder(folderId: string, name: string): Promise<FolderMutationResult> {
  await requireOperator();
  const trimmed = name?.trim();
  if (!folderId?.trim()) return { ok: false, error: "A folder id is required." };
  if (!trimmed) return { ok: false, error: "A folder name is required." };
  if (!isSupabaseAdminConfigured()) return { ok: true, persisted: false };
  try {
    const orgId = await getCurrentOrgId();
    const matched = await renameFolder(folderId, trimmed, orgId);
    if (!matched) return { ok: false, error: "That folder isn't in this workspace." };
    revalidatePath("/library");
    return { ok: true, persisted: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not rename the folder." };
  }
}

/**
 * Delete a folder. Org-scoped. Its assets are not lost — the FK is
 * `ON DELETE SET NULL`, so they fall back to "All assets", and child folders are
 * promoted to the root. Internal organization — never outbound.
 */
export async function deleteLibraryFolder(folderId: string): Promise<FolderMutationResult> {
  await requireOperator();
  if (!folderId?.trim()) return { ok: false, error: "A folder id is required." };
  if (!isSupabaseAdminConfigured()) return { ok: true, persisted: false };
  try {
    const orgId = await getCurrentOrgId();
    const matched = await deleteFolder(folderId, orgId);
    if (!matched) return { ok: false, error: "That folder isn't in this workspace." };
    revalidatePath("/library");
    return { ok: true, persisted: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not delete the folder." };
  }
}

function formatSize(bytes: number): string {
  return bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export type UploadAssetResult =
  | { ok: true; persisted: boolean; asset?: Asset }
  | { ok: false; error: string };

/**
 * Persist an operator-uploaded media file to media_assets (public campaign-media
 * bucket) so it becomes real, reusable library media — not a session-only preview.
 * New uploads are stored with `available_to_arc = false` (passed explicitly, not
 * inherited from the DB default): the operator marks what Arc may reuse via
 * setLibraryAssetArcAvailability. Held media is not mirrored into the Brain.
 * Returns the stored asset in the view's shape so the grid can show it immediately.
 */
export async function uploadLibraryAsset(formData: FormData): Promise<UploadAssetResult> {
  await requireOperator();

  const file = formData.get("file");
  const folderId = (formData.get("folderId") as string | null)?.trim() || null;
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Choose a file first." };
  const accepted = acceptUpload(file.name, file.type);
  if (!accepted.ok) return { ok: false, error: "Unsupported file type — use an image, MP4/MOV/WEBM video, PDF, or a .docx/.md/.csv/.txt document." };
  if (file.size > MAX_UPLOAD_BYTES) return { ok: false, error: "File is too large — keep it under 50MB." };

  if (!isSupabaseAdminConfigured()) return { ok: true, persisted: false };

  try {
    const [orgId, uploadedBy] = await Promise.all([getCurrentOrgId(), getOperatorActor()]);
    const contentType = accepted.contentType;
    const kind = kindForContentType(contentType);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const scan = scanMediaIngest({ fileName: file.name, kind });
    const { id, url } = await insertAssetWithUrl({
      orgId,
      folderId,
      fileName: file.name,
      bytes,
      contentType,
      kind,
      byteSize: file.size,
      source: "uploaded",
      provenance: { origin: "operator_upload" },
      riskFlags: scan.riskFlags,
      tags: scan.tags,
      uploadedBy,
    });
    revalidatePath("/library");

    const asset: Asset = {
      id: 0, // reassigned client-side
      rid: id,
      nm: file.name,
      kind: kind === "video" ? "video" : kind === "document" ? "document" : "image",
      pv: "upload",
      sc: kind === "video" ? "video" : kind === "document" ? "doc" : "photo",
      folder: folderId ?? "",
      dim: "—",
      size: formatSize(file.size),
      tags: ["imported"],
      arc: false,
      used: [],
      by: uploadedBy,
      added: "just now",
      recent: 1,
      risk: "Imported — provenance unverified before Arc may reuse.",
      img: url,
      lineage: [["upload", "Uploaded by you"]],
      uses: 0,
    };
    return { ok: true, persisted: true, asset };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not upload the file." };
  }
}

/**
 * Real backend for the Library "Import from URL" modal (previously a
 * session-only preview that persisted nothing). SSRF-guarded https fetch, the
 * shared upload policy, and the same ingest scan every other path gets. Held
 * for provenance review like all imports — never outbound.
 */
export async function importLibraryAssetFromUrl(input: {
  url: string;
  name?: string;
  folderId?: string | null;
}): Promise<UploadAssetResult> {
  await requireOperator();

  const url = input.url?.trim();
  if (!url) return { ok: false, error: "Enter a URL first." };
  const fallbackName = decodeURIComponent(url.split("?")[0]!.split("/").pop() ?? "") || "imported-asset";
  const fileName = input.name?.trim() || fallbackName;

  if (!isSupabaseAdminConfigured()) return { ok: true, persisted: false };

  try {
    const fetched = await fetchRemoteMedia({ url, fileName });
    if (!fetched.ok) return { ok: false, error: fetched.error };

    const [orgId, uploadedBy] = await Promise.all([getCurrentOrgId(), getOperatorActor()]);
    const kind = kindForContentType(fetched.contentType);
    const scan = scanMediaIngest({ fileName, kind, provenance: { sourceUrl: url } });
    const { id, url: publicUrl } = await insertAssetWithUrl({
      orgId,
      folderId: input.folderId?.trim() || null,
      fileName,
      bytes: fetched.bytes,
      contentType: fetched.contentType,
      kind,
      byteSize: fetched.bytes.byteLength,
      source: "url_import",
      provenance: { origin: "url_import", sourceUrl: url },
      riskFlags: scan.riskFlags,
      tags: scan.tags,
      uploadedBy,
    });
    revalidatePath("/library");

    const asset: Asset = {
      id: 0, // reassigned client-side
      rid: id,
      nm: fileName,
      kind: kind === "video" ? "video" : kind === "document" ? "document" : "image",
      pv: "upload",
      sc: kind === "video" ? "video" : kind === "document" ? "doc" : "photo",
      folder: input.folderId ?? "",
      dim: "—",
      size: formatSize(fetched.bytes.byteLength),
      tags: scan.tags.length ? scan.tags : ["imported"],
      arc: false,
      used: [],
      by: uploadedBy,
      added: "just now",
      recent: 1,
      risk: "Imported from URL — provenance unverified before Arc may reuse.",
      img: kind === "image" ? publicUrl : undefined,
      lineage: [["upload", "Imported from URL"]],
      uses: 0,
    };
    return { ok: true, persisted: true, asset };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not import that URL." };
  }
}

export type SetArcAvailabilityResult =
  | { ok: true; persisted: boolean }
  | { ok: false; error: string };

/**
 * The operator's provenance decision: whether Arc may reuse a Library asset.
 *
 * This is the gate the Library has always advertised ("Mark what Arc may use") but
 * never enforced — the toggle was local component state, so nothing reached the DB.
 * Granting also mirrors the asset into the Brain; revoking removes that node, so
 * recall can't keep surfacing media the operator just pulled back. Neither direction
 * sends anything outbound.
 */
export async function setLibraryAssetArcAvailability(
  assetId: string,
  value: boolean,
): Promise<SetArcAvailabilityResult> {
  await requireOperator();

  if (!assetId?.trim()) return { ok: false, error: "An asset id is required." };
  if (!isSupabaseAdminConfigured()) return { ok: true, persisted: false };

  try {
    const orgId = await getCurrentOrgId();
    const matched = await setAvailableToArc(assetId, value, orgId);
    if (!matched) return { ok: false, error: "That asset isn't in this workspace." };

    // Best-effort: the flag is the source of truth, so don't fail the operator's
    // decision if the Brain mirror lags.
    if (value) await syncMediaRecordToBrain(assetId, { orgId }).catch(() => undefined);
    else await removeMediaRecordFromBrain(assetId, { orgId }).catch(() => undefined);

    revalidatePath("/library");
    return { ok: true, persisted: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not update the asset." };
  }
}

export type EditAssetResult = { ok: true; persisted: boolean } | { ok: false; error: string };

/**
 * Rename a Library asset's display name. Org-scoped through the service-role
 * client (renameAsset returns false when the id isn't this workspace's row).
 * Display-only — the storage path/URL are untouched, nothing outbound.
 */
export async function renameLibraryAsset(assetId: string, name: string): Promise<EditAssetResult> {
  await requireOperator();
  const trimmed = name?.trim();
  if (!assetId?.trim()) return { ok: false, error: "An asset id is required." };
  if (!trimmed) return { ok: false, error: "A name is required." };
  if (!isSupabaseAdminConfigured()) return { ok: true, persisted: false };
  try {
    const orgId = await getCurrentOrgId();
    const matched = await renameAsset(assetId, trimmed, orgId);
    if (!matched) return { ok: false, error: "That asset isn't in this workspace." };
    revalidatePath("/library");
    return { ok: true, persisted: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not rename the asset." };
  }
}

/** Replace a Library asset's tags (tags already drive the search/filter). Org-scoped. */
export async function setLibraryAssetTags(assetId: string, tags: string[]): Promise<EditAssetResult> {
  await requireOperator();
  if (!assetId?.trim()) return { ok: false, error: "An asset id is required." };
  const clean = [...new Set(tags.map((tag) => tag.trim()).filter(Boolean))].slice(0, 24);
  if (!isSupabaseAdminConfigured()) return { ok: true, persisted: false };
  try {
    const orgId = await getCurrentOrgId();
    const matched = await setAssetTags(assetId, clean, orgId);
    if (!matched) return { ok: false, error: "That asset isn't in this workspace." };
    revalidatePath("/library");
    return { ok: true, persisted: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not update the tags." };
  }
}

export type DeleteAssetResult = { ok: true; persisted: boolean } | { ok: false; error: string };

/**
 * Delete a Library asset — removes the storage object + the row, and drops any
 * Brain mirror so recall can't keep surfacing deleted media. Org-scoped through
 * the RLS-bypassing service-role client (deleteAsset returns false when the id
 * isn't this workspace's row). Never outbound. Campaigns that already embedded the
 * media keep their own snapshot (the reference lives in their audit_payload), so
 * deleting here only removes it from the Library.
 */
export async function deleteLibraryAsset(assetId: string): Promise<DeleteAssetResult> {
  await requireOperator();

  if (!assetId?.trim()) return { ok: false, error: "An asset id is required." };
  if (!isSupabaseAdminConfigured()) return { ok: true, persisted: false };

  try {
    const orgId = await getCurrentOrgId();
    const deleted = await deleteAsset(assetId, orgId);
    if (!deleted) return { ok: false, error: "That asset isn't in this workspace." };

    await removeMediaRecordFromBrain(assetId, { orgId }).catch(() => undefined);

    revalidatePath("/library");
    return { ok: true, persisted: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not delete the asset." };
  }
}
