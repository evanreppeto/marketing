import { arcGuard, fail, ok } from "@/app/api/v1/arc/_lib/http";
import { pageMeta, readLimit } from "@/app/api/v1/arc/_lib/paging";
import { type CompanyStatus } from "@/domain";
import { listCompaniesPage } from "@/lib/repos";

/**
 * Read-only company search for Arc.
 *
 *   GET /api/v1/arc/crm/companies?status=active&persona=...&limit=25
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
  const partnerTier = url.searchParams.get("partner_tier") ?? undefined;
  const q = url.searchParams.get("q") ?? undefined;
  const limit = readLimit(url);

  try {
    const { companies, total } = await listCompaniesPage({ orgId: allowed.scope.orgId, status: status as CompanyStatus | undefined, persona, partnerTier, q, limit });
    return ok({ companies, ...pageMeta(total, companies.length, limit) });
  } catch (error) {
    return fail("failed", error instanceof Error ? error.message : "Failed to list companies.", 502);
  }
}
