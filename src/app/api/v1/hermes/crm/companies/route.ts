import { fail, guard, ok } from "@/app/api/v1/hermes/_lib/http";
import { type CompanyStatus } from "@/domain";
import { listCompanies } from "@/lib/repos";

/**
 * Read-only company search for Mark.
 *
 *   GET /api/v1/hermes/crm/companies?status=active&persona=...&limit=50
 */
export async function GET(request: Request) {
  const denied = guard(request);
  if (denied) return denied;

  const url = new URL(request.url);
  const status = url.searchParams.get("status") ?? undefined;
  const persona = url.searchParams.get("persona") ?? undefined;
  const limitParam = Number(url.searchParams.get("limit"));
  const limit = Number.isInteger(limitParam) && limitParam > 0 ? limitParam : undefined;

  try {
    const companies = await listCompanies({ status: status as CompanyStatus | undefined, persona, limit });
    return ok({ companies });
  } catch (error) {
    return fail("failed", error instanceof Error ? error.message : "Failed to list companies.", 502);
  }
}
