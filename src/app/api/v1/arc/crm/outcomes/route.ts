import { arcGuard, fail, ok } from "@/app/api/v1/arc/_lib/http";
import { centsToUsd } from "@/app/api/v1/arc/_lib/money";
import { type OutcomeStatus } from "@/domain";
import { listOutcomes } from "@/lib/repos";

/**
 * Read-only outcome (won/lost/paid) view for Arc.
 *
 *   GET /api/v1/arc/crm/outcomes?status=won&persona=...&company_id=...&limit=50
 */
export async function GET(request: Request) {
  const allowed = await arcGuard(request);
  if (!allowed.ok) return allowed.response;

  const url = new URL(request.url);
  const status = url.searchParams.get("status") ?? undefined;
  const persona = url.searchParams.get("persona") ?? undefined;
  const companyId = url.searchParams.get("company_id") ?? undefined;
  const limitParam = Number(url.searchParams.get("limit"));
  const limit = Number.isInteger(limitParam) && limitParam > 0 ? limitParam : undefined;

  try {
    const outcomes = await listOutcomes({ orgId: allowed.scope.orgId, status: status as OutcomeStatus | undefined, persona, companyId, limit });
    // Dollars, not cents — Arc quotes these straight to the operator. See _lib/money.
    return ok({ outcomes: outcomes.map((o) => centsToUsd(o, "grossRevenueCents", "grossMarginCents")) });
  } catch (error) {
    return fail("failed", error instanceof Error ? error.message : "Failed to list outcomes.", 502);
  }
}
