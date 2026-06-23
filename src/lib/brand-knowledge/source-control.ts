import { listGoogleDriveSourcesForCurrentOperator, type GoogleDriveSourceView } from "@/lib/google-drive/sources";
import { listNodes, type BrainNode } from "@/lib/knowledge-graph/read-model";
import { getMediaLibraryData } from "@/lib/media-library/read-model";
import { type MediaAssetView } from "@/lib/media-library/types";

import {
  brandSourceSortScore,
  classifyBrandSource,
  type BrandSourceClassification,
} from "./source-classifier";

export type SourceControlTone = "amber" | "green" | "red" | "blue" | "gray";
export type SourceControlAssetStatus = {
  label: "Blocked" | "Review" | "Trusted" | "Learned" | "New";
  tone: SourceControlTone;
  detail: string;
};
export type SourceControlBrainStats = {
  total: number;
  trusted: number;
  proposed: number;
  rejected: number;
};
export type SourceControlAsset = {
  id: string;
  label: string;
  provider: "Drive" | "URL" | "Upload" | "Library" | "Note";
  source: string;
  kind: string;
  size: string | null;
  availableToArc: boolean;
  classification: Pick<BrandSourceClassification, "label" | "confidence" | "reason">;
  brain: SourceControlBrainStats;
  status: SourceControlAssetStatus;
};
export type SourceControlDriveSource = {
  id: string;
  label: string;
  status: GoogleDriveSourceView["status"];
  lastSyncedAt: string | null;
  lastImportedCount: number;
  lastError: string | null;
};
export type SourceControlReviewItem = {
  id: string;
  kind: string;
  label: string;
  body: string | null;
  summary: string | null;
  sourceLabel: string;
  sourceProvider: SourceControlAsset["provider"];
  confidence: number | null;
};
export type SourceControlData = {
  assets: SourceControlAsset[];
  driveSources: SourceControlDriveSource[];
  reviewItems: SourceControlReviewItem[];
  stats: {
    sources: number;
    driveSources: number;
    ready: number;
    learned: number;
    review: number;
    blocked: number;
  };
};

const REVIEW_LIMIT = 8;

export function isBrandKnowledgeSource(asset: MediaAssetView, classification = classifyBrandSource(asset)): boolean {
  return (
    asset.kind === "document" ||
    asset.source === "google_drive" ||
    asset.source === "url" ||
    classification.confidence === "high"
  );
}

function providerFor(asset: MediaAssetView): SourceControlAsset["provider"] {
  if (asset.source === "google_drive") return "Drive";
  if (asset.source === "url") return "URL";
  if (asset.source === "note") return "Note";
  if (asset.source === "uploaded") return "Upload";
  return "Library";
}

function brainStats(nodes: BrainNode[], assetId: string): SourceControlBrainStats {
  const linked = nodes.filter((node) => node.refTable === "media_assets" && node.refId === assetId);
  return {
    total: linked.length,
    trusted: linked.filter((node) => node.trustTier === "trusted").length,
    proposed: linked.filter((node) => node.trustTier === "proposed").length,
    rejected: linked.filter((node) => node.trustTier === "rejected").length,
  };
}

function statusFor(asset: MediaAssetView, brain: SourceControlBrainStats): SourceControlAssetStatus {
  if (!asset.availableToArc) {
    return { label: "Blocked", tone: "red", detail: "Hidden from Arc until access is enabled." };
  }
  if (brain.proposed > 0) {
    return { label: "Review", tone: "amber", detail: "Arc extracted knowledge that needs operator approval." };
  }
  if (brain.trusted > 0) {
    return { label: "Trusted", tone: "green", detail: "Approved knowledge from this source is trusted in Brain." };
  }
  if (brain.total > 0) {
    return { label: "Learned", tone: "blue", detail: "This source has linked Brain memory." };
  }
  return { label: "New", tone: "gray", detail: "Ready to sync into Brand knowledge." };
}

function mapDriveSource(source: GoogleDriveSourceView): SourceControlDriveSource {
  return {
    id: source.id,
    label: source.driveFolderName || source.driveFolderId,
    status: source.status,
    lastSyncedAt: source.lastSyncedAt,
    lastImportedCount: source.lastImportedCount,
    lastError: source.lastError,
  };
}

export function buildSourceControlData(input: {
  assets: MediaAssetView[];
  nodes: BrainNode[];
  driveSources?: GoogleDriveSourceView[];
}): SourceControlData {
  const assets = input.assets
    .map((asset) => {
      const classification = classifyBrandSource(asset);
      const brain = brainStats(input.nodes, asset.id);
      return { asset, classification, brain };
    })
    .filter(({ asset, classification }) => isBrandKnowledgeSource(asset, classification))
    .sort((a, b) => {
      const statusScore = Number(!a.asset.availableToArc) - Number(!b.asset.availableToArc);
      return (
        statusScore ||
        b.brain.proposed - a.brain.proposed ||
        brandSourceSortScore(a.classification, a.asset.availableToArc) -
          brandSourceSortScore(b.classification, b.asset.availableToArc)
      );
    })
    .map(({ asset, classification, brain }) => ({
      id: asset.id,
      label: asset.fileName,
      provider: providerFor(asset),
      source: asset.source,
      kind: asset.kind,
      size: asset.size,
      availableToArc: asset.availableToArc,
      classification: {
        label: classification.label,
        confidence: classification.confidence,
        reason: classification.reason,
      },
      brain,
      status: statusFor(asset, brain),
    }));

  const assetById = new Map(assets.map((asset) => [asset.id, asset]));
  const reviewItems = input.nodes
    .filter((node) => node.trustTier === "proposed" && node.refTable === "media_assets" && node.refId)
    .map((node) => {
      const source = node.refId ? assetById.get(node.refId) : undefined;
      if (!source) return null;
      return {
        id: node.id,
        kind: node.kind,
        label: node.label,
        body: node.body,
        summary: node.summary,
        sourceLabel: source.label,
        sourceProvider: source.provider,
        confidence: node.confidence,
      } satisfies SourceControlReviewItem;
    })
    .filter((item): item is SourceControlReviewItem => Boolean(item))
    .slice(0, REVIEW_LIMIT);

  const driveSources = (input.driveSources ?? []).map(mapDriveSource);
  const learned = assets.filter((asset) => asset.brain.trusted > 0 || asset.brain.total > 0).length;

  return {
    assets,
    driveSources,
    reviewItems,
    stats: {
      sources: assets.length,
      driveSources: driveSources.length,
      ready: assets.filter((asset) => asset.status.label === "New").length,
      learned,
      review: reviewItems.length,
      blocked: assets.filter((asset) => !asset.availableToArc).length,
    },
  };
}

export type ReviewSourceGroup = {
  sourceLabel: string;
  sourceProvider: SourceControlAsset["provider"];
  items: SourceControlReviewItem[];
  count: number;
};

/** Group proposed review items by the document they were extracted from,
 * preserving first-seen order so the newest upload's facts stay together. */
export function groupReviewItemsBySource(items: SourceControlReviewItem[]): ReviewSourceGroup[] {
  const groups = new Map<string, ReviewSourceGroup>();
  for (const item of items) {
    const existing = groups.get(item.sourceLabel);
    if (existing) {
      existing.items.push(item);
      existing.count += 1;
    } else {
      groups.set(item.sourceLabel, {
        sourceLabel: item.sourceLabel,
        sourceProvider: item.sourceProvider,
        items: [item],
        count: 1,
      });
    }
  }
  return [...groups.values()];
}

export async function loadSourceControlData(): Promise<SourceControlData> {
  const [library, nodesResult, driveSources] = await Promise.all([
    getMediaLibraryData(),
    listNodes({ refTable: "media_assets" }),
    listGoogleDriveSourcesForCurrentOperator().catch(() => []),
  ]);
  return buildSourceControlData({
    assets: library.status === "live" ? library.assets : [],
    nodes: nodesResult.status === "live" ? nodesResult.nodes : [],
    driveSources,
  });
}
