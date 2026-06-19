"use server";

import { revalidatePath } from "next/cache";

import { learnBrandKnowledgeFromAsset } from "@/lib/brand-knowledge/brain-sync";
import { brandSourceSortScore, classifyBrandSource } from "@/lib/brand-knowledge/source-classifier";
import { summarizeBrandKnowledgeSync, type BrandKnowledgeSyncSummary } from "@/lib/brand-knowledge/sync-summary";
import { getCurrentOrgId } from "@/lib/auth/org";
import { getOperatorActor, requireOperator } from "@/lib/auth/operator";
import { getMediaLibraryData } from "@/lib/media-library/read-model";
import { type MediaAssetView } from "@/lib/media-library/types";
import { insertAsset } from "@/lib/media-library/persistence";
import { isSupabaseAdminConfigured } from "@/lib/supabase/server";
import { classifyKind, validateUpload } from "@/domain";

function brandKnowledgeSources(assets: MediaAssetView[]) {
  return assets
    .map((asset) => ({ asset, classification: classifyBrandSource(asset) }))
    .filter(({ asset, classification }) => {
      return asset.kind === "document" || asset.source === "google_drive" || classification.confidence === "high";
    })
    .sort((a, b) => {
      return (
        brandSourceSortScore(a.classification, a.asset.availableToArc) -
        brandSourceSortScore(b.classification, b.asset.availableToArc)
      );
    });
}

export type BrandKnowledgeSyncActionState = BrandKnowledgeSyncSummary | null;
export type BrandUploadActionState = BrandKnowledgeSyncSummary | null;

const NOT_CONFIGURED: BrandKnowledgeSyncSummary = {
  ok: false,
  message: "Supabase is not configured.",
  items: ["Brand files cannot be parsed until Supabase is connected"],
};

export async function syncBrandKnowledgeSourcesAction(
  _previous: BrandKnowledgeSyncActionState,
  formData: FormData,
): Promise<BrandKnowledgeSyncActionState> {
  void formData;
  await requireOperator();
  if (!isSupabaseAdminConfigured()) return NOT_CONFIGURED;

  const orgId = await getCurrentOrgId();
  const library = await getMediaLibraryData();
  if (library.status !== "live") {
    return {
      ok: false,
      message: "Brand files are not available.",
      items: [library.message],
    };
  }

  const sources = brandKnowledgeSources(library.assets);
  if (sources.length === 0) return summarizeBrandKnowledgeSync({ sources: 0, created: 0, skipped: 0, updatedProfiles: 0, errors: [] });

  const totals = { sources: sources.length, created: 0, skipped: 0, updatedProfiles: 0, errors: [] as string[] };
  for (const { asset } of sources) {
    const result = await learnBrandKnowledgeFromAsset(asset, { orgId });
    totals.created += result.created;
    totals.skipped += result.skipped;
    if (result.updatedProfile) totals.updatedProfiles += 1;
    totals.errors.push(...result.errors);
  }

  revalidatePath("/brand");
  revalidatePath("/brain");
  return summarizeBrandKnowledgeSync(totals);
}

export async function uploadAndAnalyzeBrandSourcesAction(
  _previous: BrandUploadActionState,
  formData: FormData,
): Promise<BrandUploadActionState> {
  await requireOperator();
  if (!isSupabaseAdminConfigured()) return NOT_CONFIGURED;

  const orgId = await getCurrentOrgId();
  const files = formData.getAll("files").filter((file): file is File => file instanceof File && file.size > 0);
  if (files.length === 0) {
    return {
      ok: false,
      message: "No files selected.",
      items: ["Choose brand guides, voice docs, logos, proof, offerings, rules, or reference media"],
    };
  }

  const totals = { sources: files.length, created: 0, skipped: 0, updatedProfiles: 0, errors: [] as string[] };
  for (const file of files) {
    const check = validateUpload({ contentType: file.type, byteSize: file.size });
    if (!check.ok) {
      totals.errors.push(`${file.name}: ${check.reason}`);
      continue;
    }

    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const kind = classifyKind(file.type, file.name);
      const assetId = await insertAsset({
        orgId,
        folderId: null,
        fileName: file.name,
        bytes,
        contentType: file.type,
        kind,
        byteSize: file.size,
        source: "uploaded",
        provenance: { brandSource: true },
        uploadedBy: getOperatorActor(),
      });
      const result = await learnBrandKnowledgeFromAsset({
        id: assetId,
        fileName: file.name,
        kind,
        source: "uploaded",
        tags: ["brand source"],
        availableToArc: true,
        contentType: file.type,
        fileBytes: bytes,
      }, { orgId });
      totals.created += result.created;
      totals.skipped += result.skipped;
      if (result.updatedProfile) totals.updatedProfiles += 1;
      totals.errors.push(...result.errors);
    } catch (error) {
      totals.errors.push(error instanceof Error ? `${file.name}: ${error.message}` : `${file.name}: Upload failed`);
    }
  }

  revalidatePath("/brand");
  revalidatePath("/library");
  revalidatePath("/brain");
  return summarizeBrandKnowledgeSync(totals);
}
