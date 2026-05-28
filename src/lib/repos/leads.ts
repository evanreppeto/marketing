import { type SupabaseClient } from "@supabase/supabase-js";

import { type Lead, LeadSchema } from "@/domain";
import { getSupabaseAdminClient } from "@/lib/supabase/server";

export type ListLeadsFilter = Record<string, never>;

export async function listLeads(
  _filter: ListLeadsFilter = {},
  client: SupabaseClient = getSupabaseAdminClient(),
): Promise<Lead[]> {
  const { data, error } = await client
    .from("leads")
    .select("*")
    .order("received_at", { ascending: false });

  if (error) {
    throw new Error(`listLeads failed: ${error.message}`);
  }

  const rows = (data ?? []) as unknown[];
  return rows.map((row) => LeadSchema.parse(row));
}
