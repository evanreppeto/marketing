import { arcGuard, fail, ok } from "@/app/api/v1/arc/_lib/http";
import { getApprovalForApi } from "@/lib/arc-api";

/**
 * Detail for a single approval item (assets, campaign context, decision state).
 * Read-only.
 *
 *   GET /api/v1/arc/approvals/:id
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const allowed = await arcGuard(request);
  if (!allowed.ok) return allowed.response;

  const { id } = await params;

  try {
    const approval = await getApprovalForApi(
      id,
      undefined,
      { orgId: allowed.scope.orgId, workspaceId: allowed.scope.workspaceId },
    );
    if (!approval) {
      return fail("not_found", "No approval item with that id.", 404);
    }
    return ok({ approval });
  } catch (error) {
    return fail("failed", error instanceof Error ? error.message : "Failed to read approval.", 502);
  }
}
