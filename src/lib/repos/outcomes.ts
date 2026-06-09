import { type SupabaseClient } from "@supabase/supabase-js";

import { type Outcome, type OutcomeStatus, OutcomeSchema } from "@/domain";
import { getSupabaseAdminClient } from "@/lib/supabase/server";

export type ListOutcomesFilter = {
  status?: OutcomeStatus;
  persona?: string;
  companyId?: string;
  limit?: number;
};

export async function listOutcomes(
  filter: ListOutcomesFilter = {},
  client: SupabaseClient = getSupabaseAdminClient(),
): Promise<Outcome[]> {
  let query = client.from("outcomes").select("*");

  if (filter.status) query = query.eq("status", filter.status);
  if (filter.persona) query = query.eq("persona", filter.persona);
  if (filter.companyId) query = query.eq("company_id", filter.companyId);
  if (typeof filter.limit === "number") query = query.limit(filter.limit);

  const { data, error } = await query.order("created_at", { ascending: false });
  if (error) {
    throw new Error(`listOutcomes failed: ${error.message}`);
  }
  return ((data ?? []) as unknown[]).map((row) => OutcomeSchema.parse(row));
}
