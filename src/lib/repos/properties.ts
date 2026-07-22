import { type SupabaseClient } from "@supabase/supabase-js";

import { type Property, PropertySchema } from "@/domain";
import { getCurrentOrgId } from "@/lib/auth/org";
import { type FilterChain, queryPage } from "@/lib/repos/paging";
import { getSupabaseAdminClient } from "@/lib/supabase/server";


export type ListPropertiesFilter = {
  orgId?: string;
  persona?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  propertyType?: string;
  companyId?: string;
  /** Free-text search over street line 1 (case-insensitive). */
  q?: string;
  /** Page size. `0` counts without fetching rows; omitted means unbounded. */
  limit?: number;
};

function applyPropertyFilters(
  query: FilterChain,
  filter: ListPropertiesFilter,
  orgId: string | null,
): FilterChain {
  let q = query;
  if (orgId) q = q.eq("org_id", orgId);
  if (filter.persona) q = q.eq("persona", filter.persona);
  if (filter.city) q = q.ilike("city", filter.city);
  if (filter.state) q = q.eq("state", filter.state);
  if (filter.postalCode) q = q.eq("postal_code", filter.postalCode);
  if (filter.propertyType) q = q.eq("property_type", filter.propertyType);
  if (filter.companyId) q = q.eq("company_id", filter.companyId);
  if (filter.q) q = q.ilike("street_line_1", `%${filter.q}%`);
  return q;
}

/** A bounded page of properties plus the exact `total` matching the same filters. */
export async function listPropertiesPage(
  filter: ListPropertiesFilter = {},
  client?: SupabaseClient,
): Promise<{ properties: Property[]; total: number }> {
  const orgId = filter.orgId ?? (client ? null : await getCurrentOrgId());
  const { rows, total } = await queryPage<Property>({
    client: client ?? getSupabaseAdminClient(),
    table: "properties",
    orderBy: "created_at",
    limit: filter.limit,
    label: "listPropertiesPage",
    parse: (row) => PropertySchema.parse(row),
    applyFilters: (query) => applyPropertyFilters(query, filter, orgId),
  });
  return { properties: rows, total };
}

export async function listProperties(
  filter: ListPropertiesFilter = {},
  client?: SupabaseClient,
): Promise<Property[]> {
  const orgId = filter.orgId ?? (client ? null : await getCurrentOrgId());
  const { rows } = await queryPage<Property>({
    client: client ?? getSupabaseAdminClient(),
    table: "properties",
    orderBy: "created_at",
    limit: filter.limit,
    label: "listProperties",
    parse: (row) => PropertySchema.parse(row),
    applyFilters: (query) => applyPropertyFilters(query, filter, orgId),
  });
  return rows;
}

export async function getProperty(
  id: string,
  client?: SupabaseClient,
): Promise<Property | null> {
  const orgId = client ? null : await getCurrentOrgId();
  const supabase = client ?? getSupabaseAdminClient();
  let query = supabase.from("properties").select("*").eq("id", id);
  if (orgId) query = query.eq("org_id", orgId);
  const { data, error } = await query.maybeSingle();
  if (error) {
    throw new Error(`getProperty failed: ${error.message}`);
  }
  return data ? PropertySchema.parse(data) : null;
}
