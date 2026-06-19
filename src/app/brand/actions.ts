"use server";

import { revalidatePath } from "next/cache";

import { learnBrandKnowledgeFromAsset } from "@/lib/brand-knowledge/brain-sync";
import { brandSourceSortScore, classifyBrandSource } from "@/lib/brand-knowledge/source-classifier";
import { getCurrentOrgId } from "@/lib/auth/org";
import { requireOperator } from "@/lib/auth/operator";
import { getMediaLibraryData } from "@/lib/media-library/read-model";
import { type MediaAssetView } from "@/lib/media-library/types";
import { isSupabaseAdminConfigured } from "@/lib/supabase/server";

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

export async function syncBrandKnowledgeSourcesAction(_formData: FormData): Promise<void> {
  void _formData;
  await requireOperator();
  if (!isSupabaseAdminConfigured()) return;

  const orgId = await getCurrentOrgId();
  const library = await getMediaLibraryData();
  if (library.status !== "live") return;

  const sources = brandKnowledgeSources(library.assets);
  if (sources.length === 0) return;

  for (const { asset } of sources) {
    await learnBrandKnowledgeFromAsset(asset, { orgId });
  }

  revalidatePath("/brand");
  revalidatePath("/brain");
}
