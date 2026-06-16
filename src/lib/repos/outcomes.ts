import { type SupabaseClient } from "@supabase/supabase-js";

import { type Outcome, type OutcomeStatus, OutcomeSchema } from "@/domain";
import { getCurrentOrgId } from "@/lib/auth/org";
import { type Database } from "@/lib/supabase/database.types";
import { getSupabaseAdminClient } from "@/lib/supabase/server";

type PersonaMapping = Database["public"]["Enums"]["persona_mapping"];

export type ListOutcomesFilter = {
  status?: OutcomeStatus;
  persona?: string;
  companyId?: string;
  limit?: number;
};

export async function listOutcomes(
  filter: ListOutcomesFilter = {},
  client?: SupabaseClient,
): Promise<Outcome[]> {
  const orgId = client ? null : await getCurrentOrgId();
  const supabase = client ?? getSupabaseAdminClient();
  let query = supabase.from("outcomes").select("*");

  if (orgId) query = query.eq("org_id", orgId);
  if (filter.status) query = query.eq("status", filter.status);
  if (filter.persona) query = query.eq("persona", filter.persona as PersonaMapping);
  if (filter.companyId) query = query.eq("company_id", filter.companyId);
  if (typeof filter.limit === "number") query = query.limit(filter.limit);

  const { data, error } = await query.order("created_at", { ascending: false });
  if (error) {
    throw new Error(`listOutcomes failed: ${error.message}`);
  }
  return ((data ?? []) as unknown[]).map((row) => OutcomeSchema.parse(row));
}
