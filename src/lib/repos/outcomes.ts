import { type SupabaseClient } from "@supabase/supabase-js";

import { type Outcome, type OutcomeStatus, OutcomeSchema } from "@/domain";
import { getCurrentOrgId } from "@/lib/auth/org";
import { type FilterChain, queryPage } from "@/lib/repos/paging";
import { getSupabaseAdminClient } from "@/lib/supabase/server";


export type ListOutcomesFilter = {
  orgId?: string;
  status?: OutcomeStatus;
  persona?: string;
  companyId?: string;
  /** Page size. `0` counts without fetching rows; omitted means unbounded. */
  limit?: number;
};

function applyOutcomeFilters(
  query: FilterChain,
  filter: ListOutcomesFilter,
  orgId: string | null,
): FilterChain {
  let q = query;
  if (orgId) q = q.eq("org_id", orgId);
  if (filter.status) q = q.eq("status", filter.status);
  if (filter.persona) q = q.eq("persona", filter.persona);
  if (filter.companyId) q = q.eq("company_id", filter.companyId);
  return q;
}

/** A bounded page of outcomes plus the exact `total` matching the same filters. */
export async function listOutcomesPage(
  filter: ListOutcomesFilter = {},
  client?: SupabaseClient,
): Promise<{ outcomes: Outcome[]; total: number }> {
  const orgId = filter.orgId ?? (client ? null : await getCurrentOrgId());
  const { rows, total } = await queryPage<Outcome>({
    client: client ?? getSupabaseAdminClient(),
    table: "outcomes",
    orderBy: "created_at",
    limit: filter.limit,
    label: "listOutcomesPage",
    parse: (row) => OutcomeSchema.parse(row),
    applyFilters: (query) => applyOutcomeFilters(query, filter, orgId),
  });
  return { outcomes: rows, total };
}

export async function listOutcomes(
  filter: ListOutcomesFilter = {},
  client?: SupabaseClient,
): Promise<Outcome[]> {
  const orgId = filter.orgId ?? (client ? null : await getCurrentOrgId());
  const { rows } = await queryPage<Outcome>({
    client: client ?? getSupabaseAdminClient(),
    table: "outcomes",
    orderBy: "created_at",
    limit: filter.limit,
    label: "listOutcomes",
    parse: (row) => OutcomeSchema.parse(row),
    applyFilters: (query) => applyOutcomeFilters(query, filter, orgId),
  });
  return rows;
}
