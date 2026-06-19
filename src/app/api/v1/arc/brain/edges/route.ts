import { arcGuard, fail, INVALID_JSON, ok, readJson } from "@/app/api/v1/arc/_lib/http";
import { markCreateEdge } from "@/lib/arc-api/brain";

/**
 * Arc links two existing brain nodes with a typed relation.
 *
 *   POST /api/v1/arc/brain/edges
 *   { "from_node_id": "...", "to_node_id": "...", "relation": "proves" }
 */
export async function POST(request: Request) {
  const allowed = await arcGuard(request);
  if (!allowed.ok) return allowed.response;

  const body = await readJson(request);
  if (body === INVALID_JSON || typeof body !== "object" || body === null) {
    return fail("invalid_request", "Request body must be a JSON object.", 400);
  }

  try {
    const result = await markCreateEdge(body as Record<string, unknown>, { orgId: allowed.scope.orgId });
    if (!result.ok) return fail("invalid_request", result.error, 400);
    return ok({ id: result.id }, 201);
  } catch (error) {
    return fail("failed", error instanceof Error ? error.message : "Failed to write edge.", 502);
  }
}
