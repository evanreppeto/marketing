import { fail, guard, ok } from "@/app/api/v1/hermes/_lib/http";
import { listApprovalsForApi } from "@/lib/hermes-api";

/**
 * List human approval / campaign-review items for Mark to read. Read-only.
 *
 *   GET /api/v1/hermes/approvals?status=pending_approval&limit=50
 *
 * `status` may be comma-separated. Omitting it returns the active queue.
 */
export async function GET(request: Request) {
  const denied = await guard(request);
  if (denied) return denied;

  const url = new URL(request.url);
  const statusParam = url.searchParams.get("status");
  const statuses = statusParam
    ? statusParam.split(",").map((value) => value.trim()).filter(Boolean)
    : undefined;
  const limitParam = Number(url.searchParams.get("limit"));
  const limit = Number.isInteger(limitParam) && limitParam > 0 ? limitParam : undefined;

  try {
    const approvals = await listApprovalsForApi({ statuses, limit });
    return ok({ approvals });
  } catch (error) {
    return fail("failed", error instanceof Error ? error.message : "Failed to list approvals.", 502);
  }
}
