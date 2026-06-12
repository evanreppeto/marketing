import { type NodeKind, type EdgeRelation } from "@/domain";
import { type TypedSupabaseClient } from "@/lib/supabase/server";
import { createEdge, createNode, type WriteResult } from "@/lib/knowledge-graph/persistence";
import { listNodes, type NodeFilters } from "@/lib/knowledge-graph/read-model";

type ApiDeps = { client?: TypedSupabaseClient; orgId?: string };

/** Mark creates a node — always created_by "mark"; gated kinds are forced to proposed. */
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
      source: (payload.source as string) ?? "mark",
      sourceReference: (payload.source_reference as string) ?? null,
      tags: Array.isArray(payload.tags) ? (payload.tags as string[]) : [],
      props: (payload.props as Record<string, unknown>) ?? {},
    },
    { ...deps, createdBy: "mark" },
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
      source: (payload.source as string) ?? "mark",
      props: (payload.props as Record<string, unknown>) ?? {},
    },
    { ...deps, createdBy: "mark" },
  );
}

/** Mark reads its brain for reasoning context. */
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
