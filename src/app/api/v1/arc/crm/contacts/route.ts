import { arcGuard, fail, ok } from "@/app/api/v1/arc/_lib/http";
import { pageMeta, readLimit } from "@/app/api/v1/arc/_lib/paging";
import { type ContactStatus } from "@/domain";
import { listContactsPage } from "@/lib/repos";

/**
 * Read-only contact search for Arc.
 *
 *   GET /api/v1/arc/crm/contacts?status=active&persona=...&company_id=...&limit=25
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
  const q = url.searchParams.get("q") ?? undefined;
  const limit = readLimit(url);

  try {
    const { contacts, total } = await listContactsPage({ orgId: allowed.scope.orgId, status: status as ContactStatus | undefined, persona, companyId, q, limit });
    return ok({ contacts, ...pageMeta(total, contacts.length, limit) });
  } catch (error) {
    return fail("failed", error instanceof Error ? error.message : "Failed to list contacts.", 502);
  }
}
