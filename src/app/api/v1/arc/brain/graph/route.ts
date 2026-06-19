import { arcGuard, fail, ok } from "@/app/api/v1/arc/_lib/http";
import { markGraphExport } from "@/lib/arc-api/brain";

/**
 * Arc / portable tools fetch the whole brain as a graph.json artifact.
 *   GET /api/v1/arc/brain/graph  ->  { nodes, links }
 */
export async function GET(request: Request) {
  const allowed = await arcGuard(request);
  if (!allowed.ok) return allowed.response;
  try {
    const result = await markGraphExport({ orgId: allowed.scope.orgId });
    if (result.status !== "live") return fail("not_configured", result.message, 503);
    return ok({ nodes: result.nodes, links: result.links, truncated: result.truncated }, 200);
  } catch (error) {
    return fail("failed", error instanceof Error ? error.message : "Failed to export graph.", 502);
  }
}
