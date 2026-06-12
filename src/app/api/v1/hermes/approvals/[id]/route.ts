import { fail, guard, ok } from "@/app/api/v1/hermes/_lib/http";
import { getApprovalForApi } from "@/lib/hermes-api";

/**
 * Detail for a single approval item (assets, campaign context, decision state).
 * Read-only.
 *
 *   GET /api/v1/hermes/approvals/:id
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await guard(request);
  if (denied) return denied;

  const { id } = await params;

  try {
    const approval = await getApprovalForApi(id);
    if (!approval) {
      return fail("not_found", "No approval item with that id.", 404);
    }
    return ok({ approval });
  } catch (error) {
    return fail("failed", error instanceof Error ? error.message : "Failed to read approval.", 502);
  }
}
