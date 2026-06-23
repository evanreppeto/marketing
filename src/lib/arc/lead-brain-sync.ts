import { type LeadIngestionResult, type ParsedLeadIngestionInput } from "@/domain";
import { createEdge, createNode } from "@/lib/knowledge-graph/persistence";
import { type PersistedLeadIngestion } from "@/lib/lead-ingestion/persistence";
import { type TypedSupabaseClient } from "@/lib/supabase/server";

type AcceptedResult = Extract<LeadIngestionResult, { ok: true }>;

export type LeadBrainSyncResult = {
  nodeIds: { company: string | null; contact: string | null; lead: string | null };
  edgeIds: string[];
};

/**
 * Mirror an Arc-created lead bundle into the brain (knowledge graph) so Arc can
 * later recall what it created. Each CRM entity becomes a `crm_ref` node that
 * *references* the row (refTable/refId) rather than copying it; `crm_ref` is not
 * a gated kind, so Arc's nodes land as `observed` — internal and usable, never
 * outbound, never self-approved. A stable `key` (crm:<table>:<id>) makes the
 * write idempotent against the (org_id, kind, key) unique index.
 *
 * Best-effort by contract: every write is swallowed on failure. The lead row is
 * already persisted by the time this runs — a brain hiccup must never turn a
 * successful lead creation into an error. Mirrors brand-knowledge/brain-sync.ts.
 */
export async function syncArcLeadToBrain(params: {
  input: ParsedLeadIngestionInput;
  result: AcceptedResult;
  persisted: PersistedLeadIngestion;
  client: TypedSupabaseClient;
  orgId: string;
}): Promise<LeadBrainSyncResult> {
  const { input, result, persisted, client, orgId } = params;
  const deps = { client, orgId, createdBy: "arc" as const };
  const out: LeadBrainSyncResult = { nodeIds: { company: null, contact: null, lead: null }, edgeIds: [] };

  // Company node (skip if the bundle carried no company).
  if (persisted.companyId && input.company) {
    const node = await createNode(
      {
        kind: "crm_ref",
        label: input.company.name,
        key: `crm:companies:${persisted.companyId}`,
        refTable: "companies",
        refId: persisted.companyId,
        persona: result.persona,
        source: "crm",
        tags: ["crm", "company"],
        props: {
          source: input.source,
          ...(input.company.partnerTier ? { partnerTier: input.company.partnerTier } : {}),
        },
      },
      deps,
    );
    if (node.ok) out.nodeIds.company = node.id;
  }

  // Contact node.
  if (persisted.contactId && input.contact) {
    const name = [input.contact.firstName, input.contact.lastName].filter(Boolean).join(" ").trim();
    const label = name || input.contact.email || input.contact.phone || "Contact";
    const node = await createNode(
      {
        kind: "crm_ref",
        label,
        key: `crm:contacts:${persisted.contactId}`,
        refTable: "contacts",
        refId: persisted.contactId,
        persona: result.persona,
        source: "crm",
        tags: ["crm", "contact"],
        props: { source: input.source },
      },
      deps,
    );
    if (node.ok) out.nodeIds.contact = node.id;
  }

  // Lead node (always — leadId is non-null on a successful persist).
  const leadLabel = input.company?.name
    ? `${input.company.name} — ${result.persona} lead`
    : `${result.persona} lead — ${input.source}`;
  const leadNode = await createNode(
    {
      kind: "crm_ref",
      label: leadLabel,
      summary: input.lossSummary ?? null,
      key: `crm:leads:${persisted.leadId}`,
      refTable: "leads",
      refId: persisted.leadId,
      persona: result.persona,
      source: "crm",
      tags: ["crm", "lead"],
      props: {
        source: input.source,
        leadScore: result.scores.leadScore,
        routing: result.routing,
      },
    },
    deps,
  );
  if (leadNode.ok) out.nodeIds.lead = leadNode.id;

  // Edges: link the lead/contact to the company so the graph is traversable.
  // Only drawn when both endpoints were freshly created this run (an existing
  // entity whose node already exists returns no id — best-effort, not fatal).
  const edge = async (fromNodeId: string, toNodeId: string, relation: "belongs_to" | "relates_to") => {
    const e = await createEdge({ fromNodeId, toNodeId, relation, source: "crm" }, deps);
    if (e.ok) out.edgeIds.push(e.id);
  };
  if (out.nodeIds.lead && out.nodeIds.company) await edge(out.nodeIds.lead, out.nodeIds.company, "belongs_to");
  if (out.nodeIds.contact && out.nodeIds.company) await edge(out.nodeIds.contact, out.nodeIds.company, "belongs_to");
  if (out.nodeIds.lead && out.nodeIds.contact) await edge(out.nodeIds.lead, out.nodeIds.contact, "relates_to");

  return out;
}
