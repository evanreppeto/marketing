import { type NodeKind, type EdgeRelation } from "@/domain";
import { type TypedSupabaseClient } from "@/lib/supabase/server";
import { createEdge, createNode, type WriteResult } from "@/lib/knowledge-graph/persistence";
import { listNodes, type NodeFilters } from "@/lib/knowledge-graph/read-model";
import { getBrainGraph } from "@/lib/knowledge-graph/graph";

type ApiDeps = { client?: TypedSupabaseClient; orgId?: string };

/** Arc creates a node — always created_by "arc"; gated kinds are forced to proposed. */
export async function markCreateNode(
  payload: Record<string, unknown>,
  deps: ApiDeps = {},
): Promise<WriteResult> {
  return createNode(
    {
      kind: payload.kind as NodeKind,
      label: payload.label as string,
      body: (payload.body as string) ?? null,
      summary: (payload.summary as string) ?? null,
      persona: (payload.persona as string) ?? null,
      confidence: (payload.confidence as number) ?? null,
      key: (payload.key as string) ?? null,
      refTable: (payload.ref_table as never) ?? null,
      refId: (payload.ref_id as string) ?? null,
      source: (payload.source as string) ?? "arc",
      sourceReference: (payload.source_reference as string) ?? null,
      tags: Array.isArray(payload.tags) ? (payload.tags as string[]) : [],
      props: (payload.props as Record<string, unknown>) ?? {},
    },
    { ...deps, createdBy: "arc" },
  );
}

export async function markCreateEdge(
  payload: Record<string, unknown>,
  deps: ApiDeps = {},
): Promise<WriteResult> {
  return createEdge(
    {
      fromNodeId: payload.from_node_id as string,
      toNodeId: payload.to_node_id as string,
      relation: payload.relation as EdgeRelation,
      weight: (payload.weight as number) ?? null,
      source: (payload.source as string) ?? "arc",
      props: (payload.props as Record<string, unknown>) ?? {},
    },
    { ...deps, createdBy: "arc" },
  );
}

/** Arc reads its brain for reasoning context. */
export async function markQueryBrain(payload: Record<string, unknown>, deps: ApiDeps = {}) {
  const filters: NodeFilters = {
    kind: typeof payload.kind === "string" ? payload.kind : undefined,
    trustTier: typeof payload.trust_tier === "string" ? (payload.trust_tier as never) : undefined,
    persona: typeof payload.persona === "string" ? payload.persona : undefined,
    refTable: typeof payload.ref_table === "string" ? payload.ref_table : undefined,
    refId: typeof payload.ref_id === "string" ? payload.ref_id : undefined,
    search: typeof payload.search === "string" ? payload.search : undefined,
  };
  return listNodes(filters, deps.client, deps.orgId);
}

export type GraphExportNode = {
  id: string;
  kind: string;
  label: string;
  trustTier: string;
  persona: string | null;
  refTable: string | null;
  refId: string | null;
};
export type GraphExportLink = { source: string; target: string; relation: string; weight: number | null };
export type GraphExport =
  | { status: "live"; nodes: GraphExportNode[]; links: GraphExportLink[]; truncated: boolean }
  | { status: "unavailable"; message: string };

/** Whole-brain graph.json artifact (force-graph shape) for Arc / portable tools. */
export async function markGraphExport(deps: ApiDeps = {}): Promise<GraphExport> {
  const graph = await getBrainGraph({}, deps.client, deps.orgId);
  if (graph.status !== "live") return graph;
  return {
    status: "live",
    nodes: graph.nodes.map((n) => ({
      id: n.id,
      kind: n.kind,
      label: n.label,
      trustTier: n.trustTier,
      persona: n.persona,
      refTable: n.refTable,
      refId: n.refId,
    })),
    links: graph.edges.map((e) => ({ source: e.fromNodeId, target: e.toNodeId, relation: e.relation, weight: e.weight })),
    truncated: graph.truncated,
  };
}
