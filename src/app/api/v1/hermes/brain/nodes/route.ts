import { fail, guard, INVALID_JSON, ok, readJson } from "@/app/api/v1/hermes/_lib/http";
import { markCreateNode } from "@/lib/hermes-api/brain";

/**
 * Mark writes a node into its marketing brain. Gated kinds (brand_fact,
 * messaging_angle, cta, proof_point) are ALWAYS forced to `proposed` — Mark
 * cannot self-approve. No outbound side effects.
 *
 *   POST /api/v1/hermes/brain/nodes
 *   { "kind": "brand_fact", "label": "...", "body": "...", ... }
 */
export async function POST(request: Request) {
  const denied = await guard(request);
  if (denied) return denied;

  const body = await readJson(request);
  if (body === INVALID_JSON || typeof body !== "object" || body === null) {
    return fail("invalid_request", "Request body must be a JSON object.", 400);
  }

  try {
    const result = await markCreateNode(body as Record<string, unknown>);
    if (!result.ok) return fail("invalid_request", result.error, 400);
    return ok({ id: result.id, kind: (body as Record<string, unknown>).kind }, 201);
  } catch (error) {
    return fail("failed", error instanceof Error ? error.message : "Failed to write node.", 502);
  }
}
