import { type SupabaseClient } from "@supabase/supabase-js";

import { type Company, CompanySchema, type CompanyStatus } from "@/domain";
import { getCurrentOrgId } from "@/lib/auth/org";
import { type FilterChain, queryPage } from "@/lib/repos/paging";
import { type Database } from "@/lib/supabase/database.types";
import { getSupabaseAdminClient } from "@/lib/supabase/server";

type PersonaMapping = Database["public"]["Enums"]["persona_mapping"];

export type ListCompaniesFilter = {
  orgId?: string;
  status?: CompanyStatus;
  persona?: string;
  partnerTier?: string;
  /** Free-text search over company name (case-insensitive). */
  q?: string;
  /** Page size. `0` counts without fetching rows; omitted means unbounded. */
  limit?: number;
};

function applyCompanyFilters(
  query: FilterChain,
  filter: ListCompaniesFilter,
  orgId: string | null,
): FilterChain {
  let q = query;
  if (orgId) q = q.eq("org_id", orgId);
  if (filter.status) q = q.eq("status", filter.status);
  if (filter.persona) q = q.eq("persona", filter.persona as PersonaMapping);
  if (filter.partnerTier) q = q.eq("partner_tier", filter.partnerTier);
  if (filter.q) q = q.ilike("name", `%${filter.q}%`);
  return q;
}

/** A bounded page of companies plus the exact `total` matching the same filters. */
export async function listCompaniesPage(
  filter: ListCompaniesFilter = {},
  client?: SupabaseClient,
): Promise<{ companies: Company[]; total: number }> {
  const orgId = filter.orgId ?? (client ? null : await getCurrentOrgId());
  const { rows, total } = await queryPage<Company>({
    client: client ?? getSupabaseAdminClient(),
    table: "companies",
    orderBy: "created_at",
    limit: filter.limit,
    label: "listCompaniesPage",
    parse: (row) => CompanySchema.parse(row),
    applyFilters: (query) => applyCompanyFilters(query, filter, orgId),
  });
  return { companies: rows, total };
}

export async function listCompanies(
  filter: ListCompaniesFilter = {},
  client?: SupabaseClient,
): Promise<Company[]> {
  const orgId = filter.orgId ?? (client ? null : await getCurrentOrgId());
  const { rows } = await queryPage<Company>({
    client: client ?? getSupabaseAdminClient(),
    table: "companies",
    orderBy: "created_at",
    limit: filter.limit,
    label: "listCompanies",
    parse: (row) => CompanySchema.parse(row),
    applyFilters: (query) => applyCompanyFilters(query, filter, orgId),
  });
  return rows;
}

export async function getCompany(
  id: string,
  client?: SupabaseClient,
): Promise<Company | null> {
  const orgId = client ? null : await getCurrentOrgId();
  const supabase = client ?? getSupabaseAdminClient();
  let query = supabase.from("companies").select("*").eq("id", id);
  if (orgId) {
    query = query.eq("org_id", orgId);
  }
  const { data, error } = await query.maybeSingle();

  if (error) {
    throw new Error(`getCompany failed: ${error.message}`);
  }

  if (!data) {
    return null;
  }

  return CompanySchema.parse(data);
}
