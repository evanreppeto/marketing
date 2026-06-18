import { enrichRecall, selectRecall, type RecallCandidate, type RecallGraph, type RecallItem } from "@/domain";
import { type TypedSupabaseClient } from "@/lib/supabase/server";

import { getBrainGraph } from "./graph";

/** trusted before observed; anything else sorts last (defensive). */
const TIER_PRIORITY: Record<string, number> = { trusted: 0, observed: 1 };

/**
 * Assemble the bounded "memory" Arc recalls each turn: the org's trusted +
 * observed brain nodes, selected (core + keyword vs `message`) and enriched with
 * multi-hop relationship lines from the brain's edges. Fetches the graph once via
 * getBrainGraph with an explicit trustTiers filter — trusted+observed only (never
 * proposed/rejected/archived), and the filter avoids the empty-brain demo
 * fallback. Empty on any unavailable read.
 */
export async function getRecallMemory(
  orgId: string,
  message: string,
  client?: TypedSupabaseClient,
): Promise<RecallItem[]> {
  const graph = await getBrainGraph({ trustTiers: ["trusted", "observed"] }, client, orgId);
  if (graph.status !== "live") return [];

  const candidates: RecallCandidate[] = [...graph.nodes]
    .sort((a, b) => (TIER_PRIORITY[a.trustTier] ?? 9) - (TIER_PRIORITY[b.trustTier] ?? 9))
    .map((n) => ({ id: n.id, kind: n.kind, label: n.label, summary: n.summary, tags: n.tags, trustTier: n.trustTier }));

  const selected = selectRecall(candidates, message);
  const recallGraph: RecallGraph = {
    nodes: graph.nodes.map((n) => ({ id: n.id, label: n.label, kind: n.kind })),
    edges: graph.edges.map((e) => ({ fromNodeId: e.fromNodeId, toNodeId: e.toNodeId, relation: e.relation })),
  };
  return enrichRecall(selected, recallGraph);
}
