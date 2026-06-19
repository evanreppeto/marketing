import { arcGuard, fail, ok } from "@/app/api/v1/arc/_lib/http";
import { getLead } from "@/lib/repos";

/**
 * Read-only single lead lookup for Arc.
 *
 *   GET /api/v1/arc/crm/leads/:id
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const allowed = await arcGuard(request);
  if (!allowed.ok) return allowed.response;

  const { id } = await params;

  try {
    const lead = await getLead(id, undefined, { orgId: allowed.scope.orgId });
    if (!lead) {
      return fail("not_found", "No lead with that id.", 404);
    }
    return ok({ lead });
  } catch (error) {
    return fail("failed", error instanceof Error ? error.message : "Failed to read lead.", 502);
  }
}
