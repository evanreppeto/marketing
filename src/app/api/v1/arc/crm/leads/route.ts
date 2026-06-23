import { arcGuard, fail, INVALID_JSON, ok, readJson } from "@/app/api/v1/arc/_lib/http";
import { type LeadStatus } from "@/domain";
import { createArcLead } from "@/lib/arc/record-writes";
import { listLeads } from "@/lib/repos";
import { getSupabaseAdminClient } from "@/lib/supabase/server";

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
 * Lets Arc CREATE a new lead bundle (company -> contact -> property -> lead),
 * stamped origin=agent. Runs the same domain pipeline as the human ingest, so
 * scoring/routing match. Nothing here reaches the outside world — a new lead is
 * an internal record.
 *
 *   POST /api/v1/arc/crm/leads
 *   { "lead": { persona, source, company?, contact?, property?, ... },
 *     "review_status"?: "active" | "proposed", "agent_confidence"?: number }
 */
export async function POST(request: Request) {
  const allowed = await arcGuard(request);
  if (!allowed.ok) return allowed.response;

  const body = await readJson(request);
  if (body === INVALID_JSON || typeof body !== "object" || body === null) {
    return fail("invalid_request", "Request body must be a JSON object.", 400);
  }

  const payload = body as Record<string, unknown>;
  const lead = payload.lead;
  if (typeof lead !== "object" || lead === null) {
    return fail("invalid_request", 'Field "lead" (the lead ingestion payload) is required.', 400);
  }

  const reviewStatus = payload.review_status === "proposed" ? "proposed" : "active";
  const agentConfidence =
    typeof payload.agent_confidence === "number" ? payload.agent_confidence : null;

  try {
    const result = await createArcLead({
      payload: lead,
      supabase: getSupabaseAdminClient(),
      orgId: allowed.scope.orgId,
      reviewStatus,
      agentConfidence,
    });

    if (!result.ok) {
      return fail("invalid_request", result.errors[0]?.message ?? "Invalid lead payload.", result.httpStatus);
    }

    return ok(
      {
        lead_id: result.persisted.leadId,
        company_id: result.persisted.companyId,
        contact_id: result.persisted.contactId,
        property_id: result.persisted.propertyId,
        review_status: reviewStatus,
        dedup: result.dedup,
      },
      201,
    );
  } catch (error) {
    return fail("failed", error instanceof Error ? error.message : "Failed to create lead.", 502);
  }
}
