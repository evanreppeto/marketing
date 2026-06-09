import { type SupabaseClient } from "@supabase/supabase-js";

import { type Lead, LeadSchema, type LeadStatus } from "@/domain";
import { getSupabaseAdminClient } from "@/lib/supabase/server";

export type ListLeadsFilter = {
  status?: LeadStatus;
  persona?: string;
  source?: string;
  /** Inclusive lead_score bounds (0-100). */
  minScore?: number;
  maxScore?: number;
  /** Free-text search over loss summary (case-insensitive). */
  q?: string;
  limit?: number;
};

export async function listLeads(
  filter: ListLeadsFilter = {},
  client: SupabaseClient = getSupabaseAdminClient(),
): Promise<Lead[]> {
  let query = client.from("leads").select("*");

  if (filter.status) {
    query = query.eq("status", filter.status);
  }
  if (filter.persona) {
    query = query.eq("persona", filter.persona);
  }
  if (filter.source) {
    query = query.eq("source", filter.source);
  }
  if (typeof filter.minScore === "number") {
    query = query.gte("lead_score", filter.minScore);
  }
  if (typeof filter.maxScore === "number") {
    query = query.lte("lead_score", filter.maxScore);
  }
  if (filter.q) {
    query = query.ilike("loss_summary", `%${filter.q}%`);
  }
  if (typeof filter.limit === "number") {
    query = query.limit(filter.limit);
  }

  const { data, error } = await query.order("received_at", { ascending: false });

  if (error) {
    throw new Error(`listLeads failed: ${error.message}`);
  }

  const rows = (data ?? []) as unknown[];
  return rows.map((row) => LeadSchema.parse(row));
}

export async function getLead(
  id: string,
  client: SupabaseClient = getSupabaseAdminClient(),
): Promise<Lead | null> {
  const { data, error } = await client
    .from("leads")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(`getLead failed: ${error.message}`);
  }

  if (!data) {
    return null;
  }

  return LeadSchema.parse(data);
}

export async function countLeads(
  filter: ListLeadsFilter = {},
  client: SupabaseClient = getSupabaseAdminClient(),
): Promise<number> {
  let query = client.from("leads").select("*", { count: "exact", head: true });

  if (filter.status) {
    query = query.eq("status", filter.status);
  }
  if (filter.persona) {
    query = query.eq("persona", filter.persona);
  }
  if (filter.source) {
    query = query.eq("source", filter.source);
  }

  const { count, error } = (await query) as { count: number | null; error: { message: string } | null };

  if (error) {
    throw new Error(`countLeads failed: ${error.message}`);
  }

  return count ?? 0;
}
