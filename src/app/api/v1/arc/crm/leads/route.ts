import { arcGuard, fail, INVALID_JSON, ok, readJson } from "@/app/api/v1/arc/_lib/http";
import { type LeadStatus } from "@/domain";
import { createArcLead } from "@/lib/arc/record-writes";
import { listLeads } from "@/lib/repos";
import { getSupabaseAdminClient } from "@/lib/supabase/server";

/**
 * Read an integer query param, or undefined when it's absent or not an integer.
 *
 * Read the raw param FIRST. `Number(null)` is 0 and `Number.isInteger(0)` is
 * true, so coercing before the presence check turns an absent filter into a
 * real one — which is how an omitted `max_score` became `lead_score <= 0` and
 * silently hid every lead from Arc.
 */
function intParam(url: URL, key: string): number | undefined {
  const raw = url.searchParams.get(key);
  if (raw === null || raw.trim() === "") return undefined;
  const value = Number(raw);
  return Number.isInteger(value) ? value : undefined;
}

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
  const minScore = intParam(url, "min_score");
  const maxScore = intParam(url, "max_score");
  const limitValue = intParam(url, "limit");
  const limit = limitValue !== undefined && limitValue > 0 ? limitValue : undefined;

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
      result.persisted.leadCreated ? 201 : 200,
    );
  } catch (error) {
    return fail("failed", error instanceof Error ? error.message : "Failed to create lead.", 502);
  }
}
