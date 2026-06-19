import { type SupabaseClient } from "@supabase/supabase-js";

import { type Property, PropertySchema } from "@/domain";
import { getCurrentOrgId } from "@/lib/auth/org";
import { type Database } from "@/lib/supabase/database.types";
import { getSupabaseAdminClient } from "@/lib/supabase/server";

type PersonaMapping = Database["public"]["Enums"]["persona_mapping"];

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
  limit?: number;
};

export async function listProperties(
  filter: ListPropertiesFilter = {},
  client?: SupabaseClient,
): Promise<Property[]> {
  const orgId = filter.orgId ?? (client ? null : await getCurrentOrgId());
  const supabase = client ?? getSupabaseAdminClient();
  let query = supabase.from("properties").select("*");

  if (orgId) query = query.eq("org_id", orgId);
  if (filter.persona) query = query.eq("persona", filter.persona as PersonaMapping);
  if (filter.city) query = query.ilike("city", filter.city);
  if (filter.state) query = query.eq("state", filter.state);
  if (filter.postalCode) query = query.eq("postal_code", filter.postalCode);
  if (filter.propertyType) query = query.eq("property_type", filter.propertyType);
  if (filter.companyId) query = query.eq("company_id", filter.companyId);
  if (filter.q) query = query.ilike("street_line_1", `%${filter.q}%`);
  if (typeof filter.limit === "number") query = query.limit(filter.limit);

  const { data, error } = await query.order("created_at", { ascending: false });
  if (error) {
    throw new Error(`listProperties failed: ${error.message}`);
  }
  return ((data ?? []) as unknown[]).map((row) => PropertySchema.parse(row));
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
