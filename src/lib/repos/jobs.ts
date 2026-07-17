import { type SupabaseClient } from "@supabase/supabase-js";

import { type Job, type JobStatus, JobSchema } from "@/domain";
import { getCurrentOrgId } from "@/lib/auth/org";
import { type FilterChain, queryPage } from "@/lib/repos/paging";
import { type Database } from "@/lib/supabase/database.types";
import { getSupabaseAdminClient } from "@/lib/supabase/server";

type PersonaMapping = Database["public"]["Enums"]["persona_mapping"];

export type ListJobsFilter = {
  orgId?: string;
  status?: JobStatus;
  persona?: string;
  companyId?: string;
  /** Page size. `0` counts without fetching rows; omitted means unbounded. */
  limit?: number;
};

function applyJobFilters(query: FilterChain, filter: ListJobsFilter, orgId: string | null): FilterChain {
  let q = query;
  if (orgId) q = q.eq("org_id", orgId);
  if (filter.status) q = q.eq("status", filter.status);
  if (filter.persona) q = q.eq("persona", filter.persona as PersonaMapping);
  if (filter.companyId) q = q.eq("company_id", filter.companyId);
  return q;
}

/** A bounded page of jobs plus the exact `total` matching the same filters. */
export async function listJobsPage(
  filter: ListJobsFilter = {},
  client?: SupabaseClient,
): Promise<{ jobs: Job[]; total: number }> {
  const orgId = filter.orgId ?? (client ? null : await getCurrentOrgId());
  const { rows, total } = await queryPage<Job>({
    client: client ?? getSupabaseAdminClient(),
    table: "jobs",
    orderBy: "created_at",
    limit: filter.limit,
    label: "listJobsPage",
    parse: (row) => JobSchema.parse(row),
    applyFilters: (query) => applyJobFilters(query, filter, orgId),
  });
  return { jobs: rows, total };
}

export async function listJobs(
  filter: ListJobsFilter = {},
  client?: SupabaseClient,
): Promise<Job[]> {
  const orgId = filter.orgId ?? (client ? null : await getCurrentOrgId());
  const { rows } = await queryPage<Job>({
    client: client ?? getSupabaseAdminClient(),
    table: "jobs",
    orderBy: "created_at",
    limit: filter.limit,
    label: "listJobs",
    parse: (row) => JobSchema.parse(row),
    applyFilters: (query) => applyJobFilters(query, filter, orgId),
  });
  return rows;
}
