import { fail, guard, ok } from "@/app/api/v1/hermes/_lib/http";
import { type LeadStatus } from "@/domain";
import { listLeads } from "@/lib/repos";

/**
 * Read-only lead search for Mark.
 *
 *   GET /api/v1/hermes/crm/leads?status=qualified&persona=...&source=...&limit=50
 */
export async function GET(request: Request) {
  const denied = guard(request);
  if (denied) return denied;

  const url = new URL(request.url);
  const status = url.searchParams.get("status") ?? undefined;
  const persona = url.searchParams.get("persona") ?? undefined;
  const source = url.searchParams.get("source") ?? undefined;
  const limitParam = Number(url.searchParams.get("limit"));
  const limit = Number.isInteger(limitParam) && limitParam > 0 ? limitParam : undefined;

  try {
    const leads = await listLeads({ status: status as LeadStatus | undefined, persona, source, limit });
    return ok({ leads });
  } catch (error) {
    return fail("failed", error instanceof Error ? error.message : "Failed to list leads.", 502);
  }
}
