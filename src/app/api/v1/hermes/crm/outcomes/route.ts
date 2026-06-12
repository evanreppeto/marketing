import { fail, guard, ok } from "@/app/api/v1/hermes/_lib/http";
import { type OutcomeStatus } from "@/domain";
import { listOutcomes } from "@/lib/repos";

/**
 * Read-only outcome (won/lost/paid) view for Mark.
 *
 *   GET /api/v1/hermes/crm/outcomes?status=won&persona=...&company_id=...&limit=50
 */
export async function GET(request: Request) {
  const denied = await guard(request);
  if (denied) return denied;

  const url = new URL(request.url);
  const status = url.searchParams.get("status") ?? undefined;
  const persona = url.searchParams.get("persona") ?? undefined;
  const companyId = url.searchParams.get("company_id") ?? undefined;
  const limitParam = Number(url.searchParams.get("limit"));
  const limit = Number.isInteger(limitParam) && limitParam > 0 ? limitParam : undefined;

  try {
    const outcomes = await listOutcomes({ status: status as OutcomeStatus | undefined, persona, companyId, limit });
    return ok({ outcomes });
  } catch (error) {
    return fail("failed", error instanceof Error ? error.message : "Failed to list outcomes.", 502);
  }
}
