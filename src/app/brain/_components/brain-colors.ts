import { nodeProvenance, type BrainSourceSystem, type ProvenanceInput } from "@/domain";

/**
 * Single source of truth for kind dot colors across the Brain UI. Previously this
 * map was duplicated (and diverged) between the workspace rail and the recently-
 * learned timeline. Values are concrete hex so Cytoscape's canvas can read them.
 */
export const KIND_DOT: Record<string, string> = {
  brand_fact: "#d05038",
  persona: "#b08755",
  segment: "#5d8a4f",
  service: "#3a72b0",
  proof_point: "#8a78c0",
  messaging_angle: "#d08a2c",
  cta: "#dc6a3a",
  asset_ref: "#2f93b8",
  learning: "#4f9a8a",
  signal: "#b3604a",
  crm_ref: "#6b7d8f",
  campaign_ref: "#5878a8",
  objection: "#cc6666",
  channel: "#86868e",
  campaign: "#5878a8",
};
export const kindDot = (kind: string): string => KIND_DOT[kind] ?? "#7a828f";

/** Provenance / source-system dot colors — a separate axis from kind. */
export const SOURCE_DOT: Record<BrainSourceSystem, string> = {
  brand: "#d05038",
  crm: "#3a72b0",
  library: "#8a78c0",
  campaign: "#5878a8",
  arc: "#c8a24a",
  human: "#86868e",
};

/** Display order + labels for the source filter bar. */
export const SOURCE_ORDER: Array<{ system: BrainSourceSystem; label: string }> = [
  { system: "brand", label: "Brand" },
  { system: "crm", label: "CRM" },
  { system: "library", label: "Library" },
  { system: "campaign", label: "Campaigns" },
  { system: "arc", label: "Arc inference" },
  { system: "human", label: "Human" },
];

export type SourceCounts = { all: number; bySystem: Record<BrainSourceSystem, number> };

/** Count nodes per source system (pure). Used to label the filter pills. */
export function sourceCounts(nodes: ProvenanceInput[]): SourceCounts {
  const bySystem: Record<BrainSourceSystem, number> = {
    brand: 0, crm: 0, library: 0, campaign: 0, arc: 0, human: 0,
  };
  for (const n of nodes) bySystem[nodeProvenance(n).system] += 1;
  return { all: nodes.length, bySystem };
}
