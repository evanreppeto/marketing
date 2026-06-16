import { fail, guard, ok } from "@/app/api/v1/arc/_lib/http";
import { type LeadStatus } from "@/domain";
import { listLeads } from "@/lib/repos";

/**
 * Read-only lead search for Arc.
 *
 *   GET /api/v1/arc/crm/leads?status=qualified&persona=...&source=...&limit=50
 */
export async function GET(request: Request) {
  const denied = await guard(request);
  if (denied) return denied;

  const url = new URL(request.url);
  const status = url.searchParams.get("status") ?? undefined;
  const persona = url.searchParams.get("persona") ?? undefined;
  const source = url.searchParams.get("source") ?? undefined;
  const q = url.searchParams.get("q") ?? undefined;
  const minScoreParam = Number(url.searchParams.get("min_score"));
  const minScore = Number.isInteger(minScoreParam) ? minScoreParam : undefined;
  const maxScoreParam = Number(url.searchParams.get("max_score"));
  const maxScore = Number.isInteger(maxScoreParam) ? maxScoreParam : undefined;
  const limitParam = Number(url.searchParams.get("limit"));
  const limit = Number.isInteger(limitParam) && limitParam > 0 ? limitParam : undefined;

  try {
    const leads = await listLeads({ status: status as LeadStatus | undefined, persona, source, q, minScore, maxScore, limit });
    return ok({ leads });
  } catch (error) {
    return fail("failed", error instanceof Error ? error.message : "Failed to list leads.", 502);
  }
}
