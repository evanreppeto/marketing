import {
  type ApprovalDecision,
  type KnowledgeEdgeInput,
  type KnowledgeNodeInput,
  type NodeAuthor,
  embedHash,
  normalizeKind,
  normalizeTags,
  resolveDecisionTier,
  resolveInitialTrustTier,
  validateEdgeInput,
  validateNodeInput,
} from "@/domain";
import { getCurrentOrgId } from "@/lib/auth/org";
import { embedText } from "@/lib/embeddings/gemini-embeddings";
import { type TypedSupabaseClient, getSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/server";

export type WriteResult = { ok: true; id: string } | { ok: false; error: string };

const NOT_CONFIGURED = "Supabase is not configured, so nothing was written.";
const MISSING_WRITE_ID = "Write succeeded but did not return an id.";

type WriteDeps = {
  client?: TypedSupabaseClient;
  orgId?: string;
  /** "arc" gates gated kinds to proposed; "operator" trusts immediately. */
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
  const createdBy = deps.createdBy ?? "arc";
  const value = parsed.value;
  // Tier is ALWAYS derived — never trusted from the caller. Arc cannot self-approve.
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
  if (!data?.id) return { ok: false, error: MISSING_WRITE_ID };
  // Best-effort: make the node semantically searchable. A failure here must
  // never fail node creation (recall degrades to keyword/graph without it).
  await embedNodeBestEffort(client, orgId, data.id, value);
  return { ok: true, id: data.id };
}

async function embedNodeBestEffort(
  client: TypedSupabaseClient,
  orgId: string,
  id: string,
  value: { label: string; summary?: string | null; body?: string | null },
): Promise<void> {
  try {
    const text = [value.label, value.summary, value.body].filter(Boolean).join("\n").trim();
    const embedding = await embedText(text);
    if (!embedding) return;
    await client.from("knowledge_nodes").update({ embedding: JSON.stringify(embedding) } as never).eq("id", id).eq("org_id", orgId);
  } catch {
    // swallow — best-effort
  }
}

export async function createEdge(input: KnowledgeEdgeInput, deps: WriteDeps = {}): Promise<WriteResult> {
  const parsed = validateEdgeInput(input);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  const resolved = await resolveDeps(deps);
  if (!resolved) return { ok: false, error: NOT_CONFIGURED };
  const { client, orgId } = resolved;
  const createdBy = deps.createdBy ?? "arc";
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
  if (!data?.id) return { ok: false, error: MISSING_WRITE_ID };
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
  if (!data?.id) return { ok: false, error: MISSING_WRITE_ID };
  return { ok: true, id: data.id };
}

/**
 * Edit a node's label and/or body (operator-curated). Trust tier is untouched —
 * the operator is the human gate, so an edit doesn't bounce the node to review.
 */
export async function updateNode(
  nodeId: string,
  fields: { label?: string; body?: string | null },
  deps: WriteDeps = {},
): Promise<WriteResult> {
  const patch: { label?: string; body?: string | null } = {};
  if (fields.label !== undefined) {
    const label = fields.label.trim();
    if (!label) return { ok: false, error: "A node needs a label." };
    patch.label = label;
  }
  if (fields.body !== undefined) {
    patch.body = (fields.body ?? "").trim() || null;
  }
  if (Object.keys(patch).length === 0) return { ok: false, error: "Nothing to update." };

  const resolved = await resolveDeps(deps);
  if (!resolved) return { ok: false, error: NOT_CONFIGURED };
  const { client, orgId } = resolved;
  const { data, error } = await client
    .from("knowledge_nodes")
    .update(patch)
    .eq("id", nodeId)
    .eq("org_id", orgId)
    .select("id")
    .single<{ id: string }>();
  if (error) return { ok: false, error: error.message };
  if (!data?.id) return { ok: false, error: MISSING_WRITE_ID };
  return { ok: true, id: data.id };
}

/**
 * Change a node's kind (operator-curated). Accepts built-in or custom kinds via
 * normalizeKind. The trust tier is left untouched — this only re-labels the node.
 */
export async function setNodeKind(
  nodeId: string,
  kind: string,
  deps: WriteDeps = {},
): Promise<WriteResult> {
  const normalized = normalizeKind(kind);
  if (!normalized) return { ok: false, error: "That kind isn't valid (start with a letter; letters, numbers, underscores)." };
  const resolved = await resolveDeps(deps);
  if (!resolved) return { ok: false, error: NOT_CONFIGURED };
  const { client, orgId } = resolved;
  const { data, error } = await client
    .from("knowledge_nodes")
    .update({ kind: normalized })
    .eq("id", nodeId)
    .eq("org_id", orgId)
    .select("id")
    .single<{ id: string }>();
  if (error) return { ok: false, error: error.message };
  if (!data?.id) return { ok: false, error: MISSING_WRITE_ID };
  return { ok: true, id: data.id };
}

/** Replace a node's freeform tags (operator-curated metadata, not gated). */
export async function setNodeTags(
  nodeId: string,
  tags: string[],
  deps: WriteDeps = {},
): Promise<WriteResult> {
  const resolved = await resolveDeps(deps);
  if (!resolved) return { ok: false, error: NOT_CONFIGURED };
  const { client, orgId } = resolved;
  const { data, error } = await client
    .from("knowledge_nodes")
    .update({ tags: normalizeTags(tags) })
    .eq("id", nodeId)
    .eq("org_id", orgId)
    .select("id")
    .single<{ id: string }>();
  if (error) return { ok: false, error: error.message };
  if (!data?.id) return { ok: false, error: MISSING_WRITE_ID };
  return { ok: true, id: data.id };
}

/**
 * Insert-or-update a reference node keyed on (org_id, kind, key). Used by CRM →
 * Brain ingestion: an edit updates the same row instead of duplicating. Always
 * authored "arc" (non-gated kinds resolve to "observed"). Re-embeds only when the
 * embed text hash changed. Trust tier is left untouched on update.
 */
export async function upsertReferenceNode(input: KnowledgeNodeInput, deps: WriteDeps = {}): Promise<WriteResult> {
  const parsed = validateNodeInput(input);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  const value = parsed.value;
  const key = value.key;
  if (!key) return { ok: false, error: "upsertReferenceNode requires a key." };

  const resolved = await resolveDeps(deps);
  if (!resolved) return { ok: false, error: NOT_CONFIGURED };
  const { client, orgId } = resolved;

  const embedTextValue = [value.label, value.summary, value.body].filter(Boolean).join("\n").trim();
  const hash = embedHash(embedTextValue);

  const existing = await client
    .from("knowledge_nodes")
    .select("id, props")
    .eq("org_id", orgId)
    .eq("kind", value.kind)
    .eq("key", key)
    .maybeSingle<{ id: string; props: Record<string, unknown> | null }>();
  if (existing.error) return { ok: false, error: existing.error.message };

  if (existing.data) {
    const id = existing.data.id;
    const prevHash = (existing.data.props as { embed_hash?: string } | null)?.embed_hash;
    const { error } = await client
      .from("knowledge_nodes")
      .update({
        label: value.label,
        summary: value.summary,
        body: value.body,
        persona: value.persona as never,
        ref_table: value.refTable,
        ref_id: value.refId,
        source: value.source ?? "crm-sync",
        tags: value.tags ?? [],
        props: { ...(existing.data.props ?? {}), embed_hash: hash } as never,
      })
      .eq("id", id)
      .eq("org_id", orgId);
    if (error) return { ok: false, error: error.message };
    if (prevHash !== hash) await embedReferenceBestEffort(client, orgId, id, embedTextValue);
    return { ok: true, id };
  }

  const trustTier = resolveInitialTrustTier({ kind: value.kind, createdBy: "arc" });
  const { data, error } = await client
    .from("knowledge_nodes")
    .insert({
      org_id: orgId,
      kind: value.kind,
      key,
      label: value.label,
      body: value.body,
      summary: value.summary,
      persona: value.persona as never,
      trust_tier: trustTier,
      confidence: value.confidence,
      ref_table: value.refTable,
      ref_id: value.refId,
      source: value.source ?? "crm-sync",
      source_reference: value.sourceReference,
      created_by: "arc",
      approved_by: null,
      approved_at: null,
      tags: value.tags ?? [],
      props: { ...(value.props ?? {}), embed_hash: hash } as never,
    })
    .select("id")
    .single<{ id: string }>();
  if (error) return { ok: false, error: error.message };
  if (!data?.id) return { ok: false, error: MISSING_WRITE_ID };
  await embedReferenceBestEffort(client, orgId, data.id, embedTextValue);
  return { ok: true, id: data.id };
}

/** Embed pre-joined text; never throws (recall degrades to keyword/graph). */
async function embedReferenceBestEffort(client: TypedSupabaseClient, orgId: string, id: string, text: string): Promise<void> {
  try {
    const embedding = await embedText(text);
    if (!embedding) return;
    await client.from("knowledge_nodes").update({ embedding: JSON.stringify(embedding) } as never).eq("id", id).eq("org_id", orgId);
  } catch {
    // best-effort
  }
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
  if (!data?.id) return { ok: false, error: MISSING_WRITE_ID };
  return { ok: true, id: data.id };
}
