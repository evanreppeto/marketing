import { getCurrentOrgId } from "@/lib/auth/org";
import { type TypedSupabaseClient, getSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/server";

import { createNode, upsertReferenceEdge } from "./persistence";

/**
 * Audience synthesis: Arc proposes a `segment` node (an audience defined from CRM
 * evidence) and links it to the persona it targets and the records that justify
 * it. `segment` is a gated kind, so the node lands `proposed` — a human approves
 * before it becomes trusted memory that shapes targeting. Edges are `observed`
 * evidence links (only the claim is gated).
 *
 * Tenancy is enforced in code, not RLS: the app uses the service-role client, so
 * the persona and every evidence id are verified to belong to `orgId` before any
 * edge is written — Arc cannot link across orgs by passing a foreign id.
 */
export type ProposeAudienceInput = {
  label: string;
  summary?: string | null;
  /** Free-text definition of who's in the audience and why. */
  body?: string | null;
  /** The targeting rule/criteria; mirrored into props for the review surface. */
  criteria?: string | null;
  /** Persona key (e.g. persona_landlord) this audience targets. */
  persona?: string | null;
  /** Brain node ids (from query_brain) that justify the audience → relates_to edges. */
  evidenceNodeIds?: string[];
  tags?: string[];
};

export type ProposeAudienceResult =
  | { ok: true; nodeId: string; personaLinked: boolean; evidenceLinked: number }
  | { ok: false; error: string };

async function resolve(deps: {
  client?: TypedSupabaseClient;
  orgId?: string;
}): Promise<{ client: TypedSupabaseClient; orgId: string } | null> {
  if (deps.client && deps.orgId) return { client: deps.client, orgId: deps.orgId };
  if (!isSupabaseAdminConfigured()) return null;
  return { client: deps.client ?? getSupabaseAdminClient(), orgId: deps.orgId ?? (await getCurrentOrgId()) };
}

export async function proposeAudienceSegment(
  input: ProposeAudienceInput,
  deps: { client?: TypedSupabaseClient; orgId?: string } = {},
): Promise<ProposeAudienceResult> {
  const label = input.label?.trim();
  if (!label) return { ok: false, error: "An audience needs a label." };

  let resolved;
  try { resolved = await resolve(deps); }
  catch (e) { return { ok: false, error: e instanceof Error ? e.message : "org unavailable" }; }
  if (!resolved) return { ok: false, error: "Supabase is not configured." };
  const { client, orgId } = resolved;

  const criteria = input.criteria?.trim() || null;
  const node = await createNode(
    {
      kind: "segment",
      label,
      summary: input.summary?.trim() || null,
      body: input.body?.trim() || criteria || null,
      persona: input.persona?.trim() || null,
      tags: input.tags ?? ["audience"],
      props: { synthesized: true, ...(criteria ? { criteria } : {}) },
    },
    { client, orgId, createdBy: "arc" },
  );
  if (!node.ok) return { ok: false, error: node.error };
  const nodeId = node.id;

  // targets → the persona node (verified in-org by kind+key).
  let personaLinked = false;
  const persona = input.persona?.trim();
  if (persona) {
    const { data } = await client
      .from("knowledge_nodes")
      .select("id")
      .eq("org_id", orgId)
      .eq("kind", "persona")
      .eq("key", persona)
      .maybeSingle<{ id: string }>();
    if (data?.id && data.id !== nodeId) {
      const edge = await upsertReferenceEdge(nodeId, data.id, "targets", { client, orgId });
      personaLinked = edge.ok;
    }
  }

  // relates_to → each evidence node, but only ids that actually exist in this org.
  let evidenceLinked = 0;
  const evidenceIds = Array.from(new Set((input.evidenceNodeIds ?? []).filter((s) => typeof s === "string" && s)));
  if (evidenceIds.length > 0) {
    const { data } = await client
      .from("knowledge_nodes")
      .select("id")
      .eq("org_id", orgId)
      .in("id", evidenceIds);
    const valid = new Set((Array.isArray(data) ? (data as Array<{ id: string }>) : []).map((r) => r.id));
    for (const id of evidenceIds) {
      if (!valid.has(id) || id === nodeId) continue;
      const edge = await upsertReferenceEdge(nodeId, id, "relates_to", { client, orgId });
      if (edge.ok) evidenceLinked++;
    }
  }

  return { ok: true, nodeId, personaLinked, evidenceLinked };
}
