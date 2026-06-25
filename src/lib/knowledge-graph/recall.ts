import { enrichRecall, selectRecall, type RecallCandidate, type RecallGraph, type RecallItem } from "@/domain";
import { embedText } from "@/lib/embeddings/gemini-embeddings";
import { type TypedSupabaseClient, getSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/server";

import { getBrainGraph } from "./graph";

/** trusted before observed; anything else sorts last (defensive). */
const TIER_PRIORITY: Record<string, number> = { trusted: 0, observed: 1 };

const SEMANTIC_K = 12;

/** Top-K semantically-nearest nodes for the message, as RecallCandidates. [] when embeddings unavailable. */
async function semanticCandidates(
  orgId: string,
  message: string,
  client: TypedSupabaseClient,
): Promise<RecallCandidate[]> {
  const embedding = await embedText(message);
  if (!embedding) return [];
  const { data, error } = await (client as unknown as { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }> }).rpc("match_knowledge_nodes", {
    query_embedding: JSON.stringify(embedding),
    match_org_id: orgId,
    match_count: SEMANTIC_K,
    tiers: ["trusted", "observed"],
  });
  if (error || !Array.isArray(data)) return [];
  return (data as Array<{ id: string; kind: string; label: string; summary: string | null; tags: string[] | null; trust_tier: string }>).map((r) => ({
    id: r.id,
    kind: r.kind,
    label: r.label,
    summary: r.summary,
    tags: r.tags ?? [],
    trustTier: r.trust_tier as RecallCandidate["trustTier"],
  }));
}

/**
 * Assemble the bounded "memory" Arc recalls each turn: the org's trusted +
 * observed brain nodes, selected (core + keyword vs `message`) and enriched with
 * multi-hop relationship lines from the brain's edges. Fetches the graph once via
 * getBrainGraph with an explicit trustTiers filter — trusted+observed only (never
 * proposed/rejected/archived), and the filter avoids the empty-brain demo
 * fallback. Semantic top-K candidates are unioned in (additive, deduped by id)
 * so nodes beyond the graph window can surface. Degrades gracefully whenever
 * embeddings or the RPC are unavailable — falls back to graph-only recall.
 * Empty on any unavailable read.
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

  // Additive semantic union: bring in top-K nearest nodes that may be beyond
  // the graph window. If Supabase isn't configured or embedText returns null,
  // semanticCandidates returns [] and the result is identical to graph-only.
  if (isSupabaseAdminConfigured() || client) {
    const resolvedClient = client ?? getSupabaseAdminClient();
    const seen = new Set(candidates.map((c) => c.id));
    for (const c of await semanticCandidates(orgId, message, resolvedClient)) {
      if (!seen.has(c.id)) {
        candidates.push(c);
        seen.add(c.id);
      }
    }
  }

  const selected = selectRecall(candidates, message);
  const recallGraph: RecallGraph = {
    nodes: graph.nodes.map((n) => ({ id: n.id, label: n.label, kind: n.kind })),
    edges: graph.edges.map((e) => ({ fromNodeId: e.fromNodeId, toNodeId: e.toNodeId, relation: e.relation })),
  };
  return enrichRecall(selected, recallGraph, { message });
}
