import {
  type ApprovalDecision,
  type KnowledgeEdgeInput,
  type KnowledgeNodeInput,
  type NodeAuthor,
  resolveDecisionTier,
  resolveInitialTrustTier,
  validateEdgeInput,
  validateNodeInput,
} from "@/domain";
import { getCurrentOrgId } from "@/lib/auth/org";
import { type TypedSupabaseClient, getSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/server";

export type WriteResult = { ok: true; id: string } | { ok: false; error: string };

const NOT_CONFIGURED = "Supabase is not configured, so nothing was written.";

type WriteDeps = {
  client?: TypedSupabaseClient;
  orgId?: string;
  /** "mark" gates gated kinds to proposed; "operator" trusts immediately. */
  createdBy?: NodeAuthor;
  /** Display name stamped as approver when an operator creates a trusted node. */
  actor?: string;
};

async function resolveDeps(deps: WriteDeps): Promise<{ client: TypedSupabaseClient; orgId: string } | null> {
  if (deps.client && deps.orgId) return { client: deps.client, orgId: deps.orgId };
  if (!isSupabaseAdminConfigured()) return null;
  return { client: deps.client ?? getSupabaseAdminClient(), orgId: deps.orgId ?? (await getCurrentOrgId()) };
}

export async function createNode(input: KnowledgeNodeInput, deps: WriteDeps = {}): Promise<WriteResult> {
  const parsed = validateNodeInput(input);
  if (!parsed.ok) return { ok: false, error: parsed.error };

  const resolved = await resolveDeps(deps);
  if (!resolved) return { ok: false, error: NOT_CONFIGURED };
  const { client, orgId } = resolved;
  const createdBy = deps.createdBy ?? "mark";
  const value = parsed.value;
  // Tier is ALWAYS derived — never trusted from the caller. Mark cannot self-approve.
  const trustTier = resolveInitialTrustTier({ kind: value.kind, createdBy });
  const approvedBy = trustTier === "trusted" && createdBy === "operator" ? deps.actor ?? "Operator" : null;

  const { data, error } = await client
    .from("knowledge_nodes")
    .insert({
      org_id: orgId,
      kind: value.kind,
      key: value.key,
      label: value.label,
      body: value.body,
      summary: value.summary,
      persona: value.persona as never,
      trust_tier: trustTier,
      confidence: value.confidence,
      ref_table: value.refTable,
      ref_id: value.refId,
      source: value.source ?? createdBy,
      source_reference: value.sourceReference,
      created_by: createdBy,
      approved_by: approvedBy,
      approved_at: approvedBy ? new Date().toISOString() : null,
      tags: value.tags ?? [],
      props: (value.props ?? {}) as never,
    })
    .select("id")
    .single<{ id: string }>();
  if (error) return { ok: false, error: error.message };
  return { ok: true, id: data.id };
}

export async function createEdge(input: KnowledgeEdgeInput, deps: WriteDeps = {}): Promise<WriteResult> {
  const parsed = validateEdgeInput(input);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  const resolved = await resolveDeps(deps);
  if (!resolved) return { ok: false, error: NOT_CONFIGURED };
  const { client, orgId } = resolved;
  const createdBy = deps.createdBy ?? "mark";
  const trustTier = createdBy === "operator" ? "trusted" : "observed";

  const { data, error } = await client
    .from("knowledge_edges")
    .insert({
      org_id: orgId,
      from_node_id: parsed.value.fromNodeId,
      to_node_id: parsed.value.toNodeId,
      relation: parsed.value.relation,
      weight: parsed.value.weight,
      trust_tier: trustTier,
      source: parsed.value.source ?? createdBy,
      created_by: createdBy,
      approved_by: createdBy === "operator" ? deps.actor ?? "Operator" : null,
      approved_at: createdBy === "operator" ? new Date().toISOString() : null,
      props: (parsed.value.props ?? {}) as never,
    })
    .select("id")
    .single<{ id: string }>();
  if (error) return { ok: false, error: error.message };
  return { ok: true, id: data.id };
}

/** Approve or reject a proposed node (operator only). */
export async function decideNode(
  nodeId: string,
  decision: ApprovalDecision,
  deps: WriteDeps & { actor?: string } = {},
): Promise<WriteResult> {
  const resolved = await resolveDeps(deps);
  if (!resolved) return { ok: false, error: NOT_CONFIGURED };
  const { client, orgId } = resolved;

  const current = await client
    .from("knowledge_nodes")
    .select("id,trust_tier")
    .eq("id", nodeId)
    .eq("org_id", orgId)
    .maybeSingle<{ id: string; trust_tier: string }>();
  if (current.error) return { ok: false, error: current.error.message };
  if (!current.data) return { ok: false, error: "Node not found." };

  const next = resolveDecisionTier(current.data.trust_tier as never, decision);
  if (!next.ok) return { ok: false, error: next.error };

  const actor = deps.actor ?? "Operator";
  const { data, error } = await client
    .from("knowledge_nodes")
    .update({
      trust_tier: next.value,
      approved_by: decision === "approve" ? actor : null,
      approved_at: decision === "approve" ? new Date().toISOString() : null,
    })
    .eq("id", nodeId)
    .eq("org_id", orgId)
    .select("id")
    .single<{ id: string }>();
  if (error) return { ok: false, error: error.message };
  return { ok: true, id: data.id };
}

/** Soft-archive a node. */
export async function archiveNode(nodeId: string, deps: WriteDeps = {}): Promise<WriteResult> {
  const resolved = await resolveDeps(deps);
  if (!resolved) return { ok: false, error: NOT_CONFIGURED };
  const { client, orgId } = resolved;
  const { data, error } = await client
    .from("knowledge_nodes")
    .update({ trust_tier: "archived" })
    .eq("id", nodeId)
    .eq("org_id", orgId)
    .select("id")
    .single<{ id: string }>();
  if (error) return { ok: false, error: error.message };
  return { ok: true, id: data.id };
}
