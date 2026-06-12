import { fail, guard, INVALID_JSON, ok, readJson } from "@/app/api/v1/hermes/_lib/http";
import { markQueryBrain } from "@/lib/hermes-api/brain";

/**
 * Mark reads its marketing brain for reasoning context.
 *
 *   POST /api/v1/hermes/brain/query
 *   { "kind": "brand_fact", "trust_tier": "trusted", "search": "..." }
 */
export async function POST(request: Request) {
  const denied = await guard(request);
  if (denied) return denied;

  const body = await readJson(request);
  const payload = body === INVALID_JSON || typeof body !== "object" || body === null ? {} : (body as Record<string, unknown>);

  try {
    const result = await markQueryBrain(payload);
    if (result.status !== "live") return fail("not_configured", result.message, 503);
    return ok({ nodes: result.nodes }, 200);
  } catch (error) {
    return fail("failed", error instanceof Error ? error.message : "Failed to query brain.", 502);
  }
}
