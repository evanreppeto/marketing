import { type BrainNode } from "@/lib/knowledge-graph/read-model";
import { type MediaAssetView } from "@/lib/media-library/types";

import { classifyBrandSource } from "./source-classifier";
import { isBrandKnowledgeSource, type SourceControlAsset } from "./source-control";

export type BrainSourceReviewItem = {
  id: string;
  kind: string;
  label: string;
  body: string | null;
  summary: string | null;
  confidence: number | null;
  createdAt: string | null;
};

export type BrainSourceReviewGroup = {
  sourceId: string;
  sourceLabel: string;
  sourceProvider: SourceControlAsset["provider"];
  classificationLabel: string;
  classificationConfidence: "high" | "medium" | "low";
  availableToArc: boolean;
  items: BrainSourceReviewItem[];
};

export type BrainSourceReviewData = {
  groups: BrainSourceReviewGroup[];
  unlinkedItems: BrainSourceReviewItem[];
  stats: {
    groups: number;
    linkedItems: number;
    unlinkedItems: number;
  };
};

function providerFor(asset: MediaAssetView): SourceControlAsset["provider"] {
  if (asset.source === "google_drive") return "Drive";
  if (asset.source === "url") return "URL";
  if (asset.source === "uploaded") return "Upload";
  return "Library";
}

function itemFromNode(node: BrainNode): BrainSourceReviewItem {
  return {
    id: node.id,
    kind: node.kind,
    label: node.label,
    body: node.body,
    summary: node.summary,
    confidence: node.confidence,
    createdAt: node.createdAt,
  };
}

export function buildBrainSourceReviewData(input: {
  assets: MediaAssetView[];
  proposedNodes: BrainNode[];
}): BrainSourceReviewData {
  const sourceAssets = input.assets
    .map((asset) => ({ asset, classification: classifyBrandSource(asset) }))
    .filter(({ asset, classification }) => isBrandKnowledgeSource(asset, classification));
  const sourceById = new Map(sourceAssets.map((source) => [source.asset.id, source]));
  const groups = new Map<string, BrainSourceReviewGroup>();
  const unlinkedItems: BrainSourceReviewItem[] = [];

  for (const node of input.proposedNodes.filter((candidate) => candidate.trustTier === "proposed")) {
    const source = node.refTable === "media_assets" && node.refId ? sourceById.get(node.refId) : undefined;
    if (!source) {
      unlinkedItems.push(itemFromNode(node));
      continue;
    }

    const existing =
      groups.get(source.asset.id) ??
      ({
        sourceId: source.asset.id,
        sourceLabel: source.asset.fileName,
        sourceProvider: providerFor(source.asset),
        classificationLabel: source.classification.label,
        classificationConfidence: source.classification.confidence,
        availableToArc: source.asset.availableToArc,
        items: [],
      } satisfies BrainSourceReviewGroup);
    existing.items.push(itemFromNode(node));
    groups.set(source.asset.id, existing);
  }

  const sortedGroups = [...groups.values()].sort((a, b) => {
    return b.items.length - a.items.length || a.sourceLabel.localeCompare(b.sourceLabel);
  });

  return {
    groups: sortedGroups,
    unlinkedItems,
    stats: {
      groups: sortedGroups.length,
      linkedItems: sortedGroups.reduce((sum, group) => sum + group.items.length, 0),
      unlinkedItems: unlinkedItems.length,
    },
  };
}
