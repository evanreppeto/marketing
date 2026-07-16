import { arcGuard, fail, ok } from "@/app/api/v1/arc/_lib/http";
import { centsToUsd } from "@/app/api/v1/arc/_lib/money";
import { type JobStatus } from "@/domain";
import { listJobs } from "@/lib/repos";

/**
 * Read-only job pipeline view for Arc.
 *
 *   GET /api/v1/arc/crm/jobs?status=scheduled&persona=...&company_id=...&limit=50
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
    const jobs = await listJobs({ orgId: allowed.scope.orgId, status: status as JobStatus | undefined, persona, companyId, limit });
    // Dollars, not cents — Arc quotes these straight to the operator. See _lib/money.
    return ok({ jobs: jobs.map((j) => centsToUsd(j, "estimatedRevenueCents")) });
  } catch (error) {
    return fail("failed", error instanceof Error ? error.message : "Failed to list jobs.", 502);
  }
}
