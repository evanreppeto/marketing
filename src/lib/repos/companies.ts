import { type SupabaseClient } from "@supabase/supabase-js";

import { type Company, CompanySchema, type CompanyStatus } from "@/domain";
import { getSupabaseAdminClient } from "@/lib/supabase/server";

export type ListCompaniesFilter = {
  status?: CompanyStatus;
  persona?: string;
  partnerTier?: string;
  /** Free-text search over company name (case-insensitive). */
  q?: string;
  limit?: number;
};

export async function listCompanies(
  filter: ListCompaniesFilter = {},
  client: SupabaseClient = getSupabaseAdminClient(),
): Promise<Company[]> {
  let query = client.from("companies").select("*");

  if (filter.status) {
    query = query.eq("status", filter.status);
  }
  if (filter.persona) {
    query = query.eq("persona", filter.persona);
  }
  if (filter.partnerTier) {
    query = query.eq("partner_tier", filter.partnerTier);
  }
  if (filter.q) {
    query = query.ilike("name", `%${filter.q}%`);
  }
  if (typeof filter.limit === "number") {
    query = query.limit(filter.limit);
  }

  const { data, error } = await query.order("created_at", { ascending: false });

  if (error) {
    throw new Error(`listCompanies failed: ${error.message}`);
  }

  const rows = (data ?? []) as unknown[];
  return rows.map((row) => CompanySchema.parse(row));
}

export async function getCompany(
  id: string,
  client: SupabaseClient = getSupabaseAdminClient(),
): Promise<Company | null> {
  const { data, error } = await client.from("companies").select("*").eq("id", id).maybeSingle();

  if (error) {
    throw new Error(`getCompany failed: ${error.message}`);
  }

  if (!data) {
    return null;
  }

  return CompanySchema.parse(data);
}
