"use server";

import { revalidatePath } from "next/cache";

import { learnBrandKnowledgeFromAsset } from "@/lib/brand-knowledge/brain-sync";
import { brandSourceSortScore, classifyBrandSource } from "@/lib/brand-knowledge/source-classifier";
import { summarizeBrandKnowledgeSync, type BrandKnowledgeSyncSummary } from "@/lib/brand-knowledge/sync-summary";
import { getCurrentOrgId } from "@/lib/auth/org";
import { getOperatorActor, requireOperator } from "@/lib/auth/operator";
import { fetchPublicBrandSignal } from "@/lib/brand-kit/website-fetch";
import { getBusinessProfile, upsertBusinessProfile } from "@/lib/brand-kit/persistence";
import { getMediaLibraryData } from "@/lib/media-library/read-model";
import { type MediaAssetView } from "@/lib/media-library/types";
import { insertAsset } from "@/lib/media-library/persistence";
import { isSupabaseAdminConfigured } from "@/lib/supabase/server";
import { classifyKind, NEUTRAL_DEFAULTS, validateBusinessProfile, validateUpload, type BrandColor, type BusinessProfile } from "@/domain";

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
export type BrandWebsiteActionState = { ok: boolean; message: string; items?: string[] } | null;
export type BrandIntakeActionState = BrandKnowledgeSyncSummary | null;

const NOT_CONFIGURED: BrandKnowledgeSyncSummary = {
  ok: false,
  message: "Supabase is not configured.",
  items: ["Brand files cannot be parsed until Supabase is connected"],
};

const WEBSITE_NOT_CONFIGURED: BrandWebsiteActionState = {
  ok: false,
  message: "Supabase is not configured.",
  items: ["Website analysis can run after the brand profile database is connected"],
};

function hostFallback(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "Company brand";
  }
}

function mergeBrandColors(current: BrandColor[], incoming: BrandColor[]): BrandColor[] {
  const seen = new Set<string>();
  const colors: BrandColor[] = [];
  for (const color of [...incoming, ...current]) {
    const hex = color.hex.toUpperCase();
    if (seen.has(hex)) continue;
    seen.add(hex);
    colors.push({ ...color, hex });
  }
  return colors.slice(0, 8);
}

function mergeWebsiteSignalIntoProfile(
  current: BusinessProfile,
  signal: Awaited<ReturnType<typeof fetchPublicBrandSignal>>,
): BusinessProfile {
  const incomingColors = signal.colors.map((color) => ({
    hex: color.hex,
    label: color.label,
    source: signal.finalUrl,
  }));
  const brandColors = mergeBrandColors(current.brandColors, incomingColors);
  const shouldUseSiteAccent = current.brandColors.length === 0 && brandColors.length > 0;

  return {
    ...current,
    displayName: current.displayName || signal.title || hostFallback(signal.finalUrl),
    description: current.description || signal.description || (signal.text ? signal.text.slice(0, 220) : current.description),
    websiteUrl: signal.finalUrl,
    faviconUrl: current.faviconUrl || signal.faviconUrl,
    accent: shouldUseSiteAccent ? brandColors[0].hex : current.accent,
    brandColors,
  };
}

function textBytes(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function compactLines(lines: Array<string | null | undefined>) {
  return lines.filter((line): line is string => Boolean(line?.trim())).join("\n");
}

function intakeTimestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function websiteHostLabel(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "website";
  }
}

function buildWebsiteSourceText(signal: Awaited<ReturnType<typeof fetchPublicBrandSignal>>) {
  const colorText = signal.colors.length
    ? `Colors: ${signal.colors.map((color) => `${color.label} ${color.hex}`).join(", ")}`
    : null;
  return compactLines([
    `Website: ${signal.finalUrl}`,
    signal.title ? `Title: ${signal.title}` : null,
    signal.description ? `Description: ${signal.description}` : null,
    signal.faviconUrl ? `Favicon: ${signal.faviconUrl}` : null,
    colorText,
    signal.text ? `Page text:\n${signal.text}` : null,
  ]);
}

function addResult(
  totals: { sources: number; created: number; skipped: number; updatedProfiles: number; errors: string[] },
  result: Awaited<ReturnType<typeof learnBrandKnowledgeFromAsset>>,
) {
  totals.created += result.created;
  totals.skipped += result.skipped;
  if (result.updatedProfile) totals.updatedProfiles += 1;
  totals.errors.push(...result.errors);
}

async function insertTextBrandSource({
  orgId,
  fileName,
  text,
  tags,
  provenance,
  url,
}: {
  orgId: string;
  fileName: string;
  text: string;
  tags: string[];
  provenance: Record<string, unknown>;
  url?: string | null;
}) {
  const bytes = textBytes(text);
  const assetId = await insertAsset({
    orgId,
    folderId: null,
    fileName,
    bytes,
    contentType: "text/plain",
    kind: "document",
    byteSize: bytes.byteLength,
    source: "uploaded",
    provenance,
    uploadedBy: getOperatorActor(),
  });

  return learnBrandKnowledgeFromAsset({
    id: assetId,
    fileName,
    kind: "document",
    source: "uploaded",
    tags,
    availableToArc: true,
    contentType: "text/plain",
    extractedText: text,
    fileBytes: bytes,
    url,
  }, { orgId });
}

function intakeMessage(sourceCount: number) {
  return `Brand intake processed from ${sourceCount} ${sourceCount === 1 ? "source" : "sources"}.`;
}

export async function submitBrandIntakeAction(
  _previous: BrandIntakeActionState,
  formData: FormData,
): Promise<BrandIntakeActionState> {
  await requireOperator();
  if (!isSupabaseAdminConfigured()) return NOT_CONFIGURED;

  const brandNotes = typeof formData.get("brandNotes") === "string" ? String(formData.get("brandNotes")).trim() : "";
  const websiteUrl = typeof formData.get("websiteUrl") === "string" ? String(formData.get("websiteUrl")).trim() : "";
  const files = formData.getAll("files").filter((file): file is File => file instanceof File && file.size > 0);

  if (!brandNotes && !websiteUrl && files.length === 0) {
    return {
      ok: false,
      message: "Add brand notes, a website, or at least one file.",
      items: ["Tell Arc what the company does, paste a public website, or attach brand assets"],
    };
  }

  const orgId = await getCurrentOrgId();
  const totals = { sources: 0, created: 0, skipped: 0, updatedProfiles: 0, errors: [] as string[] };
  const intakeItems: string[] = [];

  if (brandNotes) {
    try {
      const fileName = `Brand intake notes - ${intakeTimestamp()}.txt`;
      const result = await insertTextBrandSource({
        orgId,
        fileName,
        text: brandNotes,
        tags: ["brand source", "operator notes"],
        provenance: { brandSource: true, intakeKind: "operator_notes" },
      });
      totals.sources += 1;
      addResult(totals, result);
      intakeItems.push("Saved operator notes to Library");
    } catch (error) {
      totals.errors.push(error instanceof Error ? error.message : "Could not save operator notes.");
    }
  }

  if (websiteUrl) {
    try {
      const current = (await getBusinessProfile(orgId)) ?? NEUTRAL_DEFAULTS;
      const signal = await fetchPublicBrandSignal(websiteUrl);
      const profile = mergeWebsiteSignalIntoProfile(current, signal);
      const validation = validateBusinessProfile(profile);
      if (!validation.ok) throw new Error(`Website analysis found data, but the profile needs review: ${validation.errors.join(", ")}.`);
      await upsertBusinessProfile(orgId, profile);
      totals.updatedProfiles += 1;

      const text = buildWebsiteSourceText(signal);
      if (text) {
        const result = await insertTextBrandSource({
          orgId,
          fileName: `Website brand snapshot - ${websiteHostLabel(signal.finalUrl)}.txt`,
          text,
          tags: ["brand source", "website"],
          provenance: { brandSource: true, intakeKind: "website", sourceUrl: signal.finalUrl },
          url: signal.finalUrl,
        });
        totals.sources += 1;
        addResult(totals, result);
      }
      intakeItems.push("Analyzed website and saved a Library source");
    } catch (error) {
      totals.errors.push(error instanceof Error ? error.message : "Could not analyze the website.");
    }
  }

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
        provenance: { brandSource: true, intakeKind: "attached_file" },
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
      totals.sources += 1;
      addResult(totals, result);
    } catch (error) {
      totals.errors.push(error instanceof Error ? `${file.name}: ${error.message}` : `${file.name}: Upload failed`);
    }
  }
  if (files.length > 0) intakeItems.push(`Saved ${files.length} ${files.length === 1 ? "file" : "files"} to Library`);

  revalidatePath("/", "layout");
  revalidatePath("/brand");
  revalidatePath("/library");
  revalidatePath("/brain");
  revalidatePath("/settings");
  revalidatePath("/arc");

  const summary = summarizeBrandKnowledgeSync(totals);
  return {
    ...summary,
    message: totals.sources > 0 ? intakeMessage(totals.sources) : summary.message,
    items: [...intakeItems, ...summary.items],
  };
}

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

export async function analyzeBrandWebsiteAction(
  _previous: BrandWebsiteActionState,
  formData: FormData,
): Promise<BrandWebsiteActionState> {
  await requireOperator();
  if (!isSupabaseAdminConfigured()) return WEBSITE_NOT_CONFIGURED;

  const url = typeof formData.get("websiteUrl") === "string" ? String(formData.get("websiteUrl")).trim() : "";
  if (!url) {
    return {
      ok: false,
      message: "Add a website URL first.",
      items: ["Use the public company website, not a private dashboard or local URL"],
    };
  }

  try {
    const orgId = await getCurrentOrgId();
    const current = (await getBusinessProfile(orgId)) ?? NEUTRAL_DEFAULTS;
    const signal = await fetchPublicBrandSignal(url);
    const profile = mergeWebsiteSignalIntoProfile(current, signal);
    const validation = validateBusinessProfile(profile);
    if (!validation.ok) {
      return { ok: false, message: `Website analysis found data, but the profile needs review: ${validation.errors.join(", ")}.` };
    }

    await upsertBusinessProfile(orgId, profile);
    revalidatePath("/", "layout");
    revalidatePath("/brand");
    revalidatePath("/settings");
    revalidatePath("/arc");

    const items = [
      signal.title ? `Name signal: ${signal.title}` : null,
      signal.description ? "Description found" : null,
      signal.faviconUrl ? "Favicon found" : null,
      signal.colors.length ? `${signal.colors.length} colors found` : "No strong colors found",
    ].filter((item): item is string => Boolean(item));

    return { ok: true, message: "Website analyzed and brand updated.", items };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Could not analyze that website.",
      items: ["Check that the URL is public and starts with http:// or https://"],
    };
  }
}
