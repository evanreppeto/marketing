import { fail, guard, ok } from "@/app/api/v1/hermes/_lib/http";
import { markGraphExport } from "@/lib/hermes-api/brain";

/**
 * Mark / portable tools fetch the whole brain as a graph.json artifact.
 *   GET /api/v1/hermes/brain/graph  ->  { nodes, links }
 */
export async function GET(request: Request) {
  const denied = await guard(request);
  if (denied) return denied;
  try {
    const result = await markGraphExport();
    if (result.status !== "live") return fail("not_configured", result.message, 503);
    return ok({ nodes: result.nodes, links: result.links, truncated: result.truncated }, 200);
  } catch (error) {
    return fail("failed", error instanceof Error ? error.message : "Failed to export graph.", 502);
  }
}
