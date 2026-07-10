"use server";

import { revalidatePath } from "next/cache";

import { getOperatorActor, requireOperator } from "@/lib/auth/operator";
import { getCurrentOrgId } from "@/lib/auth/org";
import { createFolder, insertAssetWithUrl } from "@/lib/media-library/persistence";
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

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024; // 50MB — covers photos + short clips
const ALLOWED_TYPES = new Set([
  "image/png", "image/jpeg", "image/webp", "image/gif", "image/svg+xml",
  "video/mp4", "video/quicktime", "video/webm", "application/pdf",
]);

function formatSize(bytes: number): string {
  return bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export type UploadAssetResult =
  | { ok: true; persisted: boolean; asset?: Asset }
  | { ok: false; error: string };

/**
 * Persist an operator-uploaded media file to media_assets (public campaign-media
 * bucket) so it becomes real, reusable library media — not a session-only preview.
 * New uploads default to `available_to_arc = false` (the DB default): the operator
 * marks what Arc may reuse. insertAssetWithUrl also mirrors it into the Brain.
 * Returns the stored asset in the view's shape so the grid can show it immediately.
 */
export async function uploadLibraryAsset(formData: FormData): Promise<UploadAssetResult> {
  await requireOperator();

  const file = formData.get("file");
  const folderId = (formData.get("folderId") as string | null)?.trim() || null;
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Choose a file first." };
  if (!ALLOWED_TYPES.has(file.type)) return { ok: false, error: "Unsupported file type — use an image, MP4/MOV/WEBM video, or PDF." };
  if (file.size > MAX_UPLOAD_BYTES) return { ok: false, error: "File is too large — keep it under 50MB." };

  if (!isSupabaseAdminConfigured()) return { ok: true, persisted: false };

  try {
    const [orgId, uploadedBy] = await Promise.all([getCurrentOrgId(), getOperatorActor()]);
    const kind = file.type.startsWith("video/") ? "video" : file.type === "application/pdf" ? "document" : "image";
    const bytes = new Uint8Array(await file.arrayBuffer());
    const { id, url } = await insertAssetWithUrl({
      orgId,
      folderId,
      fileName: file.name,
      bytes,
      contentType: file.type,
      kind,
      byteSize: file.size,
      source: "uploaded",
      provenance: { origin: "operator_upload" },
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
