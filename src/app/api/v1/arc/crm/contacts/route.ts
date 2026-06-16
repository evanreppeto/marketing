import { fail, guard, ok } from "@/app/api/v1/arc/_lib/http";
import { type ContactStatus } from "@/domain";
import { listContacts } from "@/lib/repos";

/**
 * Read-only contact search for Arc.
 *
 *   GET /api/v1/arc/crm/contacts?status=active&persona=...&company_id=...&limit=50
 */
export async function GET(request: Request) {
  const denied = await guard(request);
  if (denied) return denied;

  const url = new URL(request.url);
  const status = url.searchParams.get("status") ?? undefined;
  const persona = url.searchParams.get("persona") ?? undefined;
  const companyId = url.searchParams.get("company_id") ?? undefined;
  const q = url.searchParams.get("q") ?? undefined;
  const limitParam = Number(url.searchParams.get("limit"));
  const limit = Number.isInteger(limitParam) && limitParam > 0 ? limitParam : undefined;

  try {
    const contacts = await listContacts({ status: status as ContactStatus | undefined, persona, companyId, q, limit });
    return ok({ contacts });
  } catch (error) {
    return fail("failed", error instanceof Error ? error.message : "Failed to list contacts.", 502);
  }
}
