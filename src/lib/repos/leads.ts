import { type SupabaseClient } from "@supabase/supabase-js";

import { type Lead, LeadSchema, type LeadStatus } from "@/domain";
import { getCurrentOrgId } from "@/lib/auth/org";
import { type Database } from "@/lib/supabase/database.types";
import { getSupabaseAdminClient } from "@/lib/supabase/server";

type PersonaMapping = Database["public"]["Enums"]["persona_mapping"];

export type ListLeadsFilter = {
  orgId?: string;
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
  client?: SupabaseClient,
): Promise<Lead[]> {
  const orgId = filter.orgId ?? (client ? null : await getCurrentOrgId());
  const supabase = client ?? getSupabaseAdminClient();
  let query = supabase.from("leads").select("*");

  if (orgId) {
    query = query.eq("org_id", orgId);
  }
  if (filter.status) {
    query = query.eq("status", filter.status);
  }
  if (filter.persona) {
    query = query.eq("persona", filter.persona as PersonaMapping);
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
  client?: SupabaseClient,
  filter: Pick<ListLeadsFilter, "orgId"> = {},
): Promise<Lead | null> {
  const orgId = filter.orgId ?? (client ? null : await getCurrentOrgId());
  const supabase = client ?? getSupabaseAdminClient();
  let query = supabase
    .from("leads")
    .select("*")
    .eq("id", id);
  if (orgId) {
    query = query.eq("org_id", orgId);
  }
  const { data, error } = await query.maybeSingle();

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
  client?: SupabaseClient,
): Promise<number> {
  const orgId = filter.orgId ?? (client ? null : await getCurrentOrgId());
  const supabase = client ?? getSupabaseAdminClient();
  let query = supabase.from("leads").select("*", { count: "exact", head: true });

  if (orgId) {
    query = query.eq("org_id", orgId);
  }
  if (filter.status) {
    query = query.eq("status", filter.status);
  }
  if (filter.persona) {
    query = query.eq("persona", filter.persona as PersonaMapping);
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
