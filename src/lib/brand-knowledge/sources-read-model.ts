import { listNodes, type BrainNode } from "@/lib/knowledge-graph/read-model";
import { getMediaLibraryData } from "@/lib/media-library/read-model";
import { type MediaAssetView } from "@/lib/media-library/types";

import { classifyBrandSource, type BrandSourceClassification } from "./source-classifier";

export type BrandSourceSummary = {
  id: string;
  fileName: string;
  kind: string;
  source: string;
  tags: string[];
  classification: { category: BrandSourceClassification["category"]; label: string; confidence: BrandSourceClassification["confidence"] };
  brain: { total: number; trusted: number; proposed: number };
};
export type BrandSourceNode = { kind: string; trustTier: string; label: string; summary: string | null; body: string | null; source: string | null };
export type BrandSourceDetail = BrandSourceSummary & { nodes: BrandSourceNode[] };

const NODE_CAP = 40;

/** An uploaded asset counts as a brand source the same way the /brand page decides. */
function isBrandSource(asset: MediaAssetView, c: BrandSourceClassification): boolean {
  return asset.kind === "document" || asset.source === "google_drive" || asset.source === "url" || c.confidence === "high";
}

function summarize(asset: MediaAssetView, c: BrandSourceClassification, nodes: BrainNode[]): BrandSourceSummary {
  const linked = nodes.filter((n) => n.refTable === "media_assets" && n.refId === asset.id);
  return {
    id: asset.id,
    fileName: asset.fileName,
    kind: asset.kind,
    source: asset.source,
    tags: asset.tags,
    classification: { category: c.category, label: c.label, confidence: c.confidence },
    brain: {
      total: linked.length,
      trusted: linked.filter((n) => n.trustTier === "trusted").length,
      proposed: linked.filter((n) => n.trustTier === "proposed").length,
    },
  };
}

async function loadBrandAssets(): Promise<{ asset: MediaAssetView; c: BrandSourceClassification }[]> {
  const library = await getMediaLibraryData();
  if (library.status !== "live") return [];
  return library.assets
    .map((asset) => ({ asset, c: classifyBrandSource(asset) }))
    .filter(({ asset, c }) => asset.availableToArc && isBrandSource(asset, c));
}

async function loadNodes(filters: Parameters<typeof listNodes>[0]): Promise<BrainNode[]> {
  const res = await listNodes(filters);
  return res.status === "live" ? res.nodes : [];
}

/** Inventory of Arc-available brand source documents + per-doc knowledge stats. */
export async function listBrandSources(): Promise<BrandSourceSummary[]> {
  const sources = await loadBrandAssets();
  if (sources.length === 0) return [];
  const nodes = await loadNodes({ refTable: "media_assets" });
  return sources.map(({ asset, c }) => summarize(asset, c, nodes));
}

/** One brand document + the knowledge extracted from it (incl. proposed). Null if not an Arc-available brand source. */
export async function getBrandSource(assetId: string): Promise<BrandSourceDetail | null> {
  const match = (await loadBrandAssets()).find(({ asset }) => asset.id === assetId);
  if (!match) return null;
  const nodes = await loadNodes({ refTable: "media_assets", refId: assetId });
  const summary = summarize(match.asset, match.c, nodes);
  return {
    ...summary,
    nodes: nodes.slice(0, NODE_CAP).map((n) => ({
      kind: n.kind, trustTier: n.trustTier, label: n.label, summary: n.summary, body: n.body, source: n.source,
    })),
  };
}
