type BrandSourceLike = {
  asset: {
    id: string;
    availableToArc: boolean;
  };
};

type BrainNodeLike = {
  refTable?: string | null;
  refId?: string | null;
};

export type BrandSourceReadiness = {
  total: number;
  readyToLearn: number;
  learned: number;
  blocked: number;
};

export function summarizeBrandSourceReadiness(
  sources: BrandSourceLike[],
  nodes: BrainNodeLike[],
): BrandSourceReadiness {
  const learnedIds = new Set(
    nodes
      .filter((node) => node.refTable === "media_assets" && node.refId)
      .map((node) => node.refId as string),
  );

  let learned = 0;
  let readyToLearn = 0;
  let blocked = 0;

  for (const source of sources) {
    if (!source.asset.availableToArc) {
      blocked += 1;
    } else if (learnedIds.has(source.asset.id)) {
      learned += 1;
    } else {
      readyToLearn += 1;
    }
  }

  return {
    total: sources.length,
    readyToLearn,
    learned,
    blocked,
  };
}
