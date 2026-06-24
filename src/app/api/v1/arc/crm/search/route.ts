import { arcGuard, fail, ok } from "@/app/api/v1/arc/_lib/http";
import { getSupabaseAdminClient } from "@/lib/supabase/server";

/**
 * Unified CRM lookup so Arc can find an existing record before deciding to
 * create one. Read-only. GET /api/v1/arc/crm/search?q=acme&type=company|contact|lead
 */
export async function GET(request: Request) {
  const allowed = await arcGuard(request);
  if (!allowed.ok) return allowed.response;

  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const type = url.searchParams.get("type") ?? "all";
  if (q.length < 2) return fail("invalid_request", 'Query "q" must be at least 2 characters.', 400);

  const orgId = allowed.scope.orgId;
  const supabase = getSupabaseAdminClient();
  // Strip PostgREST or()-filter delimiters so a query can't break out of its
  // term (the value is interpolated into an `or(...)` DSL string below).
  const like = `%${q.replace(/[(),*]/g, "")}%`;

  try {
    const out: Record<string, unknown> = {};

    if (type === "all" || type === "company") {
      const { data } = await supabase
        .from("companies")
        .select("id, name, persona, status, website_url, email")
        .eq("org_id", orgId)
        .or(`name.ilike.${like},email.ilike.${like},website_url.ilike.${like}`)
        .limit(10);
      out.companies = data ?? [];
    }

    if (type === "all" || type === "contact") {
      const { data } = await supabase
        .from("contacts")
        .select("id, first_name, last_name, email, phone, persona, status")
        .eq("org_id", orgId)
        .or(`email.ilike.${like},first_name.ilike.${like},last_name.ilike.${like},phone.ilike.${like}`)
        .limit(10);
      out.contacts = data ?? [];
    }

    if (type === "all" || type === "lead") {
      const { data } = await supabase
        .from("leads")
        .select("id, persona, status, source, lead_score, company_id, contact_id")
        .eq("org_id", orgId)
        .or(`source.ilike.${like},loss_summary.ilike.${like}`)
        .limit(10);
      out.leads = data ?? [];
    }

    return ok({ query: q, results: out });
  } catch (error) {
    return fail("failed", error instanceof Error ? error.message : "Search failed.", 502);
  }
}
