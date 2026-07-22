import { arcGuard, fail, INVALID_JSON, ok, readJson } from "@/app/api/v1/arc/_lib/http";
import { intParam, pageMeta, readLimit } from "@/app/api/v1/arc/_lib/paging";
import { type LeadStatus } from "@/domain";
import { createArcLead } from "@/lib/arc/record-writes";
import { resolveCrmNames, withCrmNamesCompact } from "@/lib/crm/names";
import { listLeadSummariesPage } from "@/lib/repos";
import { getSupabaseAdminClient } from "@/lib/supabase/server";

/**
 * Read-only lead search for Arc.
 *
 *   GET /api/v1/arc/crm/leads?status=qualified&persona=...&source=...&limit=25
 *
 * Returns a bounded page plus `total`, the exact number of leads matching the
 * filters. `limit=0` asks for that count alone. This route used to return every
 * matching row: 200 full leads (~833 chars each) overflowed the runner's
 * 8000-char tool budget, were sliced mid-JSON to 10, and Arc — with no total to
 * check against — read the fragment as the whole CRM and answered "at least 64".
 *
 * Each row is a COMPACT SUMMARY (persona/status/routing/source/loss/score/date +
 * resolved company & contact names), not the full lead: a full row is ~833 chars,
 * so a page of 25 still overflowed the tool budget and got trimmed. The heavy
 * fields (metadata, keyword signals, linked record ids) are one `get_lead` away —
 * and the summary is announced as such in `search_leads`, so the trim is visible
 * to Arc rather than a silent narrowing of what it sees.
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
  const limit = readLimit(url);

  try {
    const { leads, total } = await listLeadSummariesPage({ orgId: allowed.scope.orgId, status: status as LeadStatus | undefined, persona, source, q, minScore, maxScore, limit, excludeSynthetic: true });
    // Names REPLACE the join uuids — Arc quotes these straight to the operator, and
    // a uuid is pure weight once the name is attached. On `limit=0` (count only)
    // the page is empty, so this costs no query.
    const names = await resolveCrmNames(leads, allowed.scope.orgId);
    return ok({ leads: leads.map((l) => withCrmNamesCompact(l, names)), ...pageMeta(total, leads.length, limit) });
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
