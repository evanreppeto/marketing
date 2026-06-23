"use server";

import { revalidatePath } from "next/cache";

import { learnBrandKnowledgeFromAsset } from "@/lib/brand-knowledge/brain-sync";
import { extractAssetText } from "@/lib/brand-knowledge/asset-text";
import { brandSourceSortScore, classifyBrandSource } from "@/lib/brand-knowledge/source-classifier";
import { summarizeBrandKnowledgeSync, type BrandKnowledgeSyncSummary } from "@/lib/brand-knowledge/sync-summary";
import { discoverWebsiteSourceUrls, fetchUrlSource, type UrlSourceDocument } from "@/lib/brand-knowledge/url-source";
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
      return asset.kind === "document" || asset.source === "google_drive" || asset.source === "url" || classification.confidence === "high";
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
export type BrandUrlImportActionState = BrandKnowledgeSyncSummary | null;
export type BrandWebsiteImportActionState = BrandKnowledgeSyncSummary | null;
type ImportedUrlSourceResult = { created: number; skipped: number; updatedProfile: boolean; errors: string[] };

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

  revalidatePath("/library/brand");
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
      const extractedText = await extractAssetText({ bytes, contentType: file.type, fileName: file.name });
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
        uploadedBy: await getOperatorActor(),
      });
      const result = await learnBrandKnowledgeFromAsset({
        id: assetId,
        fileName: file.name,
        kind,
        source: "uploaded",
        tags: ["brand source"],
        availableToArc: true,
        extractedText,
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

  revalidatePath("/library/brand");
  revalidatePath("/library");
  revalidatePath("/brain");
  return summarizeBrandKnowledgeSync(totals);
}

function brandNoteFileName(note: string): string {
  const words = note.replace(/\s+/g, " ").trim().split(" ").slice(0, 6).join(" ");
  const base = words.length > 48 ? `${words.slice(0, 48)}…` : words;
  return `Brand note — ${base || "chat"}.txt`;
}

/**
 * Capture free text (e.g. a chat message describing the brand) as a brand
 * source so it runs through the same intake as files/URLs: it lands in the
 * Library and Arc proposes brand facts into the Brain for operator review.
 * Used by the brand-page "Chat with Arc" panel so typing populates the brand
 * page and the Brain, not just a conversation thread.
 */
export async function ingestBrandChatNoteAction(text: string): Promise<BrandKnowledgeSyncSummary> {
  await requireOperator();
  if (!isSupabaseAdminConfigured()) return NOT_CONFIGURED;

  const note = text.trim();
  if (!note) {
    return { ok: false, message: "Nothing to save.", items: ["Type some brand details for Arc to capture"] };
  }

  const orgId = await getCurrentOrgId();
  const uploadedBy = await getOperatorActor();
  const bytes = new TextEncoder().encode(note);
  const fileName = brandNoteFileName(note);
  const totals = { sources: 1, created: 0, skipped: 0, updatedProfiles: 0, errors: [] as string[] };

  try {
    const assetId = await insertAsset({
      orgId,
      folderId: null,
      fileName,
      bytes,
      contentType: "text/plain",
      kind: "document",
      byteSize: bytes.byteLength,
      source: "note",
      provenance: { brandSource: true, note: true, capturedVia: "brand_chat" },
      uploadedBy,
    });
    const result = await learnBrandKnowledgeFromAsset(
      {
        id: assetId,
        fileName,
        kind: "document",
        source: "note",
        tags: ["brand source", "note"],
        availableToArc: true,
        extractedText: note,
        contentType: "text/plain",
        fileBytes: bytes,
      },
      { orgId },
    );
    totals.created += result.created;
    totals.skipped += result.skipped;
    if (result.updatedProfile) totals.updatedProfiles += 1;
    totals.errors.push(...result.errors);
  } catch (error) {
    totals.errors.push(error instanceof Error ? error.message : "Could not save the note.");
  }

  revalidateBrandSourceViews();
  return summarizeBrandKnowledgeSync(totals);
}

async function importUrlSourceDocument(input: {
  orgId: string;
  source: UrlSourceDocument;
  uploadedBy: string;
}): Promise<ImportedUrlSourceResult> {
  const bytes = new TextEncoder().encode(input.source.text);
  const assetId = await insertAsset({
    orgId: input.orgId,
    folderId: null,
    fileName: input.source.fileName,
    bytes,
    contentType: "text/plain",
    kind: "document",
    byteSize: input.source.byteSize,
    source: "url",
    provenance: {
      brandSource: true,
      sourceUrl: input.source.url,
      sourceTitle: input.source.title,
      fetchedContentType: input.source.contentType,
    },
    uploadedBy: input.uploadedBy,
  });
  const result = await learnBrandKnowledgeFromAsset(
    {
      id: assetId,
      fileName: input.source.fileName,
      kind: "document",
      source: "url",
      tags: ["brand source", "url"],
      availableToArc: true,
      url: input.source.url,
      extractedText: input.source.text,
      contentType: "text/plain",
      fileBytes: bytes,
    },
    { orgId: input.orgId },
  );
  return {
    created: result.created,
    skipped: result.skipped,
    updatedProfile: Boolean(result.updatedProfile),
    errors: result.errors,
  };
}

function revalidateBrandSourceViews() {
  revalidatePath("/library/brand");
  revalidatePath("/library");
  revalidatePath("/brain");
}

export async function importAndAnalyzeBrandUrlAction(
  _previous: BrandUrlImportActionState,
  formData: FormData,
): Promise<BrandUrlImportActionState> {
  await requireOperator();
  if (!isSupabaseAdminConfigured()) return NOT_CONFIGURED;

  const rawUrl = String(formData.get("url") ?? "").trim();
  if (!rawUrl) {
    return {
      ok: false,
      message: "No URL entered.",
      items: ["Paste a public page with brand facts, services, proof, rules, or messaging"],
    };
  }

  const orgId = await getCurrentOrgId();
  const totals = { sources: 1, created: 0, skipped: 0, updatedProfiles: 0, errors: [] as string[] };

  try {
    const result = await importUrlSourceDocument({
      orgId,
      uploadedBy: await getOperatorActor(),
      source: await fetchUrlSource({ url: rawUrl }),
    });
    totals.created += result.created;
    totals.skipped += result.skipped;
    if (result.updatedProfile) totals.updatedProfiles += 1;
    totals.errors.push(...result.errors);
  } catch (error) {
    totals.errors.push(error instanceof Error ? error.message : "URL import failed.");
  }

  revalidateBrandSourceViews();
  return summarizeBrandKnowledgeSync(totals);
}

export async function importAndAnalyzeBrandWebsiteAction(
  _previous: BrandWebsiteImportActionState,
  formData: FormData,
): Promise<BrandWebsiteImportActionState> {
  await requireOperator();
  if (!isSupabaseAdminConfigured()) return NOT_CONFIGURED;

  const rawUrl = String(formData.get("websiteUrl") ?? "").trim();
  if (!rawUrl) {
    return {
      ok: false,
      message: "No website entered.",
      items: ["Paste a public homepage or sitemap entry point"],
    };
  }

  const orgId = await getCurrentOrgId();
  const uploadedBy = await getOperatorActor();
  const totals = { sources: 0, created: 0, skipped: 0, updatedProfiles: 0, errors: [] as string[] };

  try {
    const urls = await discoverWebsiteSourceUrls({ url: rawUrl, maxUrls: 6 });
    totals.sources = urls.length;
    for (const url of urls) {
      try {
        const result = await importUrlSourceDocument({
          orgId,
          uploadedBy,
          source: await fetchUrlSource({ url }),
        });
        totals.created += result.created;
        totals.skipped += result.skipped;
        if (result.updatedProfile) totals.updatedProfiles += 1;
        totals.errors.push(...result.errors.map((error) => `${url}: ${error}`));
      } catch (error) {
        totals.errors.push(error instanceof Error ? `${url}: ${error.message}` : `${url}: URL import failed.`);
      }
    }
  } catch (error) {
    totals.sources = 1;
    totals.errors.push(error instanceof Error ? error.message : "Website import failed.");
  }

  revalidateBrandSourceViews();
  return summarizeBrandKnowledgeSync(totals);
}
