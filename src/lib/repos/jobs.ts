import { type SupabaseClient } from "@supabase/supabase-js";

import { type Job, type JobStatus, JobSchema } from "@/domain";
import { getSupabaseAdminClient } from "@/lib/supabase/server";

export type ListJobsFilter = {
  status?: JobStatus;
  persona?: string;
  companyId?: string;
  limit?: number;
};

export async function listJobs(
  filter: ListJobsFilter = {},
  client: SupabaseClient = getSupabaseAdminClient(),
): Promise<Job[]> {
  let query = client.from("jobs").select("*");

  if (filter.status) query = query.eq("status", filter.status);
  if (filter.persona) query = query.eq("persona", filter.persona);
  if (filter.companyId) query = query.eq("company_id", filter.companyId);
  if (typeof filter.limit === "number") query = query.limit(filter.limit);

  const { data, error } = await query.order("created_at", { ascending: false });
  if (error) {
    throw new Error(`listJobs failed: ${error.message}`);
  }
  return ((data ?? []) as unknown[]).map((row) => JobSchema.parse(row));
}
