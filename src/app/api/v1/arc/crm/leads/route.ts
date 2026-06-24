import { arcGuard, fail, INVALID_JSON, ok, readJson } from "@/app/api/v1/arc/_lib/http";
import { parseLeadResearchInput, type LeadStatus } from "@/domain";
import { persistLeadResearch } from "@/lib/lead-research/persistence";
import { listLeads } from "@/lib/repos";

/**
 * Read-only lead search for Arc.
 *
 *   GET /api/v1/arc/crm/leads?status=qualified&persona=...&source=...&limit=50
 */
export async function GET(request: Request) {
  const allowed = await arcGuard(request);
  if (!allowed.ok) return allowed.response;

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
    const leads = await listLeads({ orgId: allowed.scope.orgId, status: status as LeadStatus | undefined, persona, source, q, minScore, maxScore, limit });
    return ok({ leads });
  } catch (error) {
    return fail("failed", error instanceof Error ? error.message : "Failed to list leads.", 502);
  }
}

/**
 * Lets Arc create a CRM lead from web research: a company, its contact(s), and a
 * leads-pipeline row — or enrich blank fields on records that already match.
 * Writes live, tagged source="arc_research". No outbound side effects.
 *
 *   POST /api/v1/arc/crm/leads
 *   { persona, company:{name,...}, contacts:[...], evidence:[{url}], ... }
 */
export async function POST(request: Request) {
  const allowed = await arcGuard(request);
  if (!allowed.ok) return allowed.response;
  const scope = { orgId: allowed.scope.orgId, workspaceId: allowed.scope.workspaceId };

  const body = await readJson(request);
  if (body === INVALID_JSON || typeof body !== "object" || body === null) {
    return fail("invalid_request", "Request body must be a JSON object.", 400);
  }

  const parsed = parseLeadResearchInput(body);
  if (!parsed.ok) return fail("invalid_request", parsed.error, 400);

  try {
    const result = await persistLeadResearch(parsed.value, scope);
    if (!result.ok) return fail("failed", result.error, 502);
    return ok(
      {
        companyId: result.companyId,
        contactIds: result.contactIds,
        leadId: result.leadId,
        enriched: result.enriched,
      },
      201,
    );
  } catch (error) {
    return fail("failed", error instanceof Error ? error.message : "Failed to write research lead.", 502);
  }
}
