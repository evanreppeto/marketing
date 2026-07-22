import { type SupabaseClient } from "@supabase/supabase-js";

import {
  type Lead,
  LEAD_SUMMARY_COLUMNS,
  LeadSchema,
  type LeadStatus,
  type LeadSummary,
  LeadSummarySchema,
} from "@/domain";
import { getCurrentOrgId } from "@/lib/auth/org";
import { type FilterChain, queryPage } from "@/lib/repos/paging";
import { getSupabaseAdminClient } from "@/lib/supabase/server";


export type ListLeadsFilter = {
  orgId?: string;
  status?: LeadStatus;
  persona?: string;
  source?: string;
  /** Hide synthetic seed fixtures from customer-facing analysis. */
  excludeSynthetic?: boolean;
  /** Inclusive lead_score bounds (0-100). */
  minScore?: number;
  maxScore?: number;
  /** Free-text search over loss summary (case-insensitive). */
  q?: string;
  /** Page size. `0` counts without fetching rows; omitted means unbounded. */
  limit?: number;
};

/**
 * The single definition of what each `ListLeadsFilter` field means as SQL.
 * Shared by every read below so a count can never honour different filters than
 * the list it describes.
 */
function applyLeadFilters(query: FilterChain, filter: ListLeadsFilter, orgId: string | null): FilterChain {
  let q = query;
  if (orgId) q = q.eq("org_id", orgId);
  if (filter.status) q = q.eq("status", filter.status);
  if (filter.persona) q = q.eq("persona", filter.persona);
  if (filter.source) q = q.eq("source", filter.source);
  if (filter.excludeSynthetic) q = q.is("metadata->>seed_batch", null);
  if (typeof filter.minScore === "number") q = q.gte("lead_score", filter.minScore);
  if (typeof filter.maxScore === "number") q = q.lte("lead_score", filter.maxScore);
  if (filter.q) q = q.ilike("loss_summary", `%${filter.q}%`);
  return q;
}

/**
 * A bounded page of leads plus the exact `total` matching the same filters.
 *
 * `total` is what lets a caller answer "how many leads?" without reading every
 * row — reading every row is what overflowed Arc's tool-text budget and left it
 * guessing from a truncated list.
 */
export async function listLeadsPage(
  filter: ListLeadsFilter = {},
  client?: SupabaseClient,
): Promise<{ leads: Lead[]; total: number }> {
  const orgId = filter.orgId ?? (client ? null : await getCurrentOrgId());
  const { rows, total } = await queryPage<Lead>({
    client: client ?? getSupabaseAdminClient(),
    table: "leads",
    orderBy: "received_at",
    limit: filter.limit,
    label: "listLeadsPage",
    parse: (row) => LeadSchema.parse(row),
    applyFilters: (query) => applyLeadFilters(query, filter, orgId),
  });
  return { leads: rows, total };
}

/**
 * A bounded page of lead SUMMARIES plus the exact `total` matching the same
 * filters — the shape Arc's `search_leads` returns.
 *
 * Same as `listLeadsPage` but fetches only `LEAD_SUMMARY_COLUMNS` and parses with
 * `LeadSummarySchema`, so the heavy fields (metadata, keyword arrays, extra
 * timestamps) are never read over the wire. It shares `applyLeadFilters`, so the
 * count and the page still honour exactly the same filters (the #484 invariant).
 * Full detail stays one `getLead` away.
 */
export async function listLeadSummariesPage(
  filter: ListLeadsFilter = {},
  client?: SupabaseClient,
): Promise<{ leads: LeadSummary[]; total: number }> {
  const orgId = filter.orgId ?? (client ? null : await getCurrentOrgId());
  const { rows, total } = await queryPage<LeadSummary>({
    client: client ?? getSupabaseAdminClient(),
    table: "leads",
    orderBy: "received_at",
    columns: LEAD_SUMMARY_COLUMNS,
    limit: filter.limit,
    label: "listLeadSummariesPage",
    parse: (row) => LeadSummarySchema.parse(row),
    applyFilters: (query) => applyLeadFilters(query, filter, orgId),
  });
  return { leads: rows, total };
}

export async function listLeads(
  filter: ListLeadsFilter = {},
  client?: SupabaseClient,
): Promise<Lead[]> {
  const orgId = filter.orgId ?? (client ? null : await getCurrentOrgId());
  const { rows } = await queryPage<Lead>({
    client: client ?? getSupabaseAdminClient(),
    table: "leads",
    orderBy: "received_at",
    limit: filter.limit,
    label: "listLeads",
    parse: (row) => LeadSchema.parse(row),
    applyFilters: (query) => applyLeadFilters(query, filter, orgId),
  });
  return rows;
}

export async function getLead(
  id: string,
  client?: SupabaseClient,
  filter: Pick<ListLeadsFilter, "orgId"> = {},
): Promise<Lead | null> {
  const orgId = filter.orgId ?? (client ? null : await getCurrentOrgId());
  const supabase = client ?? getSupabaseAdminClient();
  let query = supabase
    .from("leads")
    .select("*")
    .eq("id", id);
  if (orgId) {
    query = query.eq("org_id", orgId);
  }
  const { data, error } = await query.maybeSingle();

  if (error) {
    throw new Error(`getLead failed: ${error.message}`);
  }

  if (!data) {
    return null;
  }

  return LeadSchema.parse(data);
}

/**
 * Exact number of leads matching `filter`, fetching no rows.
 *
 * Honours every field of `ListLeadsFilter`. It previously applied only
 * org/status/persona/source while accepting `q`, `minScore` and `maxScore` —
 * so a filtered count silently answered a wider question than it was asked.
 */
export async function countLeads(
  filter: ListLeadsFilter = {},
  client?: SupabaseClient,
): Promise<number> {
  const orgId = filter.orgId ?? (client ? null : await getCurrentOrgId());
  const { total } = await queryPage<Lead>({
    client: client ?? getSupabaseAdminClient(),
    table: "leads",
    orderBy: "received_at",
    limit: 0,
    label: "countLeads",
    parse: (row) => LeadSchema.parse(row),
    applyFilters: (query) => applyLeadFilters(query, filter, orgId),
  });
  return total;
}
