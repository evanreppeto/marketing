import { arcGuard, fail, INVALID_JSON, ok, readJson } from "@/app/api/v1/arc/_lib/http";
import { proposeAudienceSegment } from "@/lib/knowledge-graph/audience";

/**
 * Arc synthesizes an audience segment from CRM evidence and proposes it for
 * approval. Creates a gated `segment` node (lands `proposed`) linked to the
 * persona it targets and the brain nodes that justify it. Org scope comes from
 * the agent token (arcGuard); evidence ids are verified in-org before linking.
 *
 *   POST /api/v1/arc/brain/audiences
 *   { label, summary?, body?, criteria?, persona?, evidence_node_ids?: string[], tags?: string[] }
 *   -> 201 { ok, status:"proposed", id, personaLinked, evidenceLinked }
 */
export async function POST(request: Request) {
  const allowed = await arcGuard(request);
  if (!allowed.ok) return allowed.response;

  const body = await readJson(request);
  if (body === INVALID_JSON || typeof body !== "object" || body === null) {
    return fail("invalid_request", "Request body must be a JSON object.", 400);
  }
  const b = body as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" ? v : undefined);
  const strings = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : undefined);

  const result = await proposeAudienceSegment(
    {
      label: str(b.label) ?? "",
      summary: str(b.summary) ?? null,
      body: str(b.body) ?? null,
      criteria: str(b.criteria) ?? null,
      persona: str(b.persona) ?? null,
      evidenceNodeIds: strings(b.evidence_node_ids),
      tags: strings(b.tags),
    },
    { orgId: allowed.scope.orgId },
  );

  if (!result.ok) return fail("invalid_request", result.error, 400);
  return ok(
    { id: result.nodeId, status: "proposed", personaLinked: result.personaLinked, evidenceLinked: result.evidenceLinked },
    201,
  );
}
