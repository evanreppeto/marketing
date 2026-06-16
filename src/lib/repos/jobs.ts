import { type SupabaseClient } from "@supabase/supabase-js";

import { type Job, type JobStatus, JobSchema } from "@/domain";
import { getCurrentOrgId } from "@/lib/auth/org";
import { type Database } from "@/lib/supabase/database.types";
import { getSupabaseAdminClient } from "@/lib/supabase/server";

type PersonaMapping = Database["public"]["Enums"]["persona_mapping"];

export type ListJobsFilter = {
  status?: JobStatus;
  persona?: string;
  companyId?: string;
  limit?: number;
};

export async function listJobs(
  filter: ListJobsFilter = {},
  client?: SupabaseClient,
): Promise<Job[]> {
  const orgId = client ? null : await getCurrentOrgId();
  const supabase = client ?? getSupabaseAdminClient();
  let query = supabase.from("jobs").select("*");

  if (orgId) query = query.eq("org_id", orgId);
  if (filter.status) query = query.eq("status", filter.status);
  if (filter.persona) query = query.eq("persona", filter.persona as PersonaMapping);
  if (filter.companyId) query = query.eq("company_id", filter.companyId);
  if (typeof filter.limit === "number") query = query.limit(filter.limit);

  const { data, error } = await query.order("created_at", { ascending: false });
  if (error) {
    throw new Error(`listJobs failed: ${error.message}`);
  }
  return ((data ?? []) as unknown[]).map((row) => JobSchema.parse(row));
}
