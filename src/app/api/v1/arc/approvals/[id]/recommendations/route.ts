import { arcGuard, fail, ok } from "@/app/api/v1/arc/_lib/http";
import { listApprovalRecommendations } from "@/lib/arc-api";

/**
 * Read back the recommendations Arc has left on an approval item (newest
 * first). Read-only — the human decision surfaces are untouched.
 *
 *   GET /api/v1/arc/approvals/:id/recommendations
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const allowed = await arcGuard(request);
  if (!allowed.ok) return allowed.response;

  const { id } = await params;

  try {
    const recommendations = await listApprovalRecommendations(
      id,
      undefined,
      { orgId: allowed.scope.orgId, workspaceId: allowed.scope.workspaceId },
    );
    return ok({ recommendations });
  } catch (error) {
    return fail("failed", error instanceof Error ? error.message : "Failed to read recommendations.", 502);
  }
}
