import { type SupabaseClient } from "@supabase/supabase-js";

import { type Company, CompanySchema, type CompanyStatus } from "@/domain";
import { getCurrentOrgId } from "@/lib/auth/org";
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
  limit?: number;
};

export async function listCompanies(
  filter: ListCompaniesFilter = {},
  client?: SupabaseClient,
): Promise<Company[]> {
  const orgId = filter.orgId ?? (client ? null : await getCurrentOrgId());
  const supabase = client ?? getSupabaseAdminClient();
  let query = supabase.from("companies").select("*");

  if (orgId) {
    query = query.eq("org_id", orgId);
  }
  if (filter.status) {
    query = query.eq("status", filter.status);
  }
  if (filter.persona) {
    query = query.eq("persona", filter.persona as PersonaMapping);
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
