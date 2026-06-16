import { fail, guard, ok } from "@/app/api/v1/arc/_lib/http";
import { type CompanyStatus } from "@/domain";
import { listCompanies } from "@/lib/repos";

/**
 * Read-only company search for Arc.
 *
 *   GET /api/v1/arc/crm/companies?status=active&persona=...&limit=50
 */
export async function GET(request: Request) {
  const denied = await guard(request);
  if (denied) return denied;

  const url = new URL(request.url);
  const status = url.searchParams.get("status") ?? undefined;
  const persona = url.searchParams.get("persona") ?? undefined;
  const partnerTier = url.searchParams.get("partner_tier") ?? undefined;
  const q = url.searchParams.get("q") ?? undefined;
  const limitParam = Number(url.searchParams.get("limit"));
  const limit = Number.isInteger(limitParam) && limitParam > 0 ? limitParam : undefined;

  try {
    const companies = await listCompanies({ status: status as CompanyStatus | undefined, persona, partnerTier, q, limit });
    return ok({ companies });
  } catch (error) {
    return fail("failed", error instanceof Error ? error.message : "Failed to list companies.", 502);
  }
}
