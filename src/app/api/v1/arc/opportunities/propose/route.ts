import { INVALID_JSON, fail, guard, ok, readJson } from "@/app/api/v1/arc/_lib/http";
import { parseOpportunityProposal } from "@/domain";
import { upsertOpportunities } from "@/lib/opportunities/persistence";

/**
 * Arc proposes a source-backed opportunity (status pending — operator-gated).
 * Reuses upsertOpportunities (dedup + pending + detected_by=arc).
 *   POST /api/v1/arc/opportunities/propose  ->  { ok, created }
 */
export async function POST(request: Request) {
  const denied = await guard(request);
  if (denied) return denied;
  const body = await readJson(request);
  if (body === INVALID_JSON) return fail("invalid_json", "Body must be valid JSON.", 400);
  const parsed = parseOpportunityProposal(body);
  if (!parsed.ok) return fail("invalid", parsed.error, 400);
  try {
    const result = await upsertOpportunities([parsed.candidate]);
    if (!result.ok) return fail("failed", result.error, 502);
    return ok({ created: result.count });
  } catch (error) {
    return fail("failed", error instanceof Error ? error.message : "Failed to save opportunity.", 502);
  }
}
