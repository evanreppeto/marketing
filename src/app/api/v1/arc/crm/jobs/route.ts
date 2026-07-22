import { arcGuard, fail, ok } from "@/app/api/v1/arc/_lib/http";
import { pageMeta, readLimit } from "@/app/api/v1/arc/_lib/paging";
import { centsToUsd } from "@/app/api/v1/arc/_lib/money";
import { resolveCrmNames, withCrmNames } from "@/lib/crm/names";
import { type JobStatus } from "@/domain";
import { listJobsPage } from "@/lib/repos";

/**
 * Read-only job pipeline view for Arc.
 *
 *   GET /api/v1/arc/crm/jobs?status=scheduled&persona=...&company_id=...&limit=25
 *
 * Bounded page + exact `total`; `limit=0` returns the count alone. See
 * `_lib/paging.ts` for why an unbounded read isn't on offer.
 */
export async function GET(request: Request) {
  const allowed = await arcGuard(request);
  if (!allowed.ok) return allowed.response;

  const url = new URL(request.url);
  const status = url.searchParams.get("status") ?? undefined;
  const persona = url.searchParams.get("persona") ?? undefined;
  const companyId = url.searchParams.get("company_id") ?? undefined;
  const limit = readLimit(url);

  try {
    const { jobs, total } = await listJobsPage({ orgId: allowed.scope.orgId, status: status as JobStatus | undefined, persona, companyId, limit, excludeSynthetic: true });
    // Dollars not cents (_lib/money) and names not uuids (lib/crm/names) — Arc
    // quotes both of these straight to the operator. On `limit=0` (count only)
    // the page is empty, so neither costs a query.
    const names = await resolveCrmNames(jobs, allowed.scope.orgId);
    return ok({
      jobs: jobs.map((j) => centsToUsd(withCrmNames(j, names), "estimatedRevenueCents")),
      ...pageMeta(total, jobs.length, limit),
    });
  } catch (error) {
    return fail("failed", error instanceof Error ? error.message : "Failed to list jobs.", 502);
  }
}
