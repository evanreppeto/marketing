import { arcGuard, fail, ok } from "@/app/api/v1/arc/_lib/http";
import { getPersonaIntelligenceData } from "@/lib/persona-intelligence/read-model";

/**
 * The Persona Revenue Intelligence overview (segments, scores, signals) for Arc.
 *   GET /api/v1/arc/persona-intelligence  ->  { ok, personaIntelligence }
 *
 * Scoped to the token's workspace via arcGuard: the read-model must be given an
 * org so it never returns another tenant's persona snapshots/knowledge/guardrails.
 */
export async function GET(request: Request) {
  const allowed = await arcGuard(request);
  if (!allowed.ok) return allowed.response;
  try {
    const data = await getPersonaIntelligenceData(allowed.scope.orgId);
    if ("status" in data && data.status === "unavailable") {
      return fail("failed", data.message ?? "Persona intelligence is unavailable.", 502);
    }
    return ok({ personaIntelligence: data });
  } catch (error) {
    return fail("failed", error instanceof Error ? error.message : "Failed to read persona intelligence.", 502);
  }
}
