import { arcGuard, fail, INVALID_JSON, ok, readJson } from "@/app/api/v1/arc/_lib/http";
import { markQueryBrain } from "@/lib/arc-api/brain";

/**
 * Arc reads its marketing brain for reasoning context.
 *
 *   POST /api/v1/arc/brain/query
 *   { "kind": "brand_fact", "trust_tier": "trusted", "search": "..." }
 */
export async function POST(request: Request) {
  const allowed = await arcGuard(request);
  if (!allowed.ok) return allowed.response;

  const body = await readJson(request);
  const payload = body === INVALID_JSON || typeof body !== "object" || body === null ? {} : (body as Record<string, unknown>);

  try {
    const result = await markQueryBrain(payload, { orgId: allowed.scope.orgId });
    if (result.status !== "live") return fail("not_configured", result.message, 503);
    return ok({ nodes: result.nodes }, 200);
  } catch (error) {
    return fail("failed", error instanceof Error ? error.message : "Failed to query brain.", 502);
  }
}
