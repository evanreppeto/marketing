import { fail, guard, ok } from "@/app/api/v1/hermes/_lib/http";
import { listApprovalRecommendations } from "@/lib/hermes-api";

/**
 * Read back the recommendations Mark has left on an approval item (newest
 * first). Read-only — the human decision surfaces are untouched.
 *
 *   GET /api/v1/hermes/approvals/:id/recommendations
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await guard(request);
  if (denied) return denied;

  const { id } = await params;

  try {
    const recommendations = await listApprovalRecommendations(id);
    return ok({ recommendations });
  } catch (error) {
    return fail("failed", error instanceof Error ? error.message : "Failed to read recommendations.", 502);
  }
}
