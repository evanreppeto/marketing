import { type SupabaseClient } from "@supabase/supabase-js";

import { type ParsedCampaignResult } from "@/domain";
import { type AgentTaskTenantFields } from "@/lib/agent-tasks/scope";

export type PersistResultsSummary = { inserted: number; updated: number };

/** Upsert campaign_results rows on the natural period key
 *  (campaign_id, campaign_asset_id, channel, period_start, period_end) using
 *  select-then-insert/update in app code (no DB unique constraint needed). */
export async function persistCampaignResults(
  rows: ParsedCampaignResult[],
  client: SupabaseClient,
  tenant?: AgentTaskTenantFields,
): Promise<PersistResultsSummary> {
  let inserted = 0;
  let updated = 0;

  for (const row of rows) {
    let query = applyOrgScope(
      client
        .from("campaign_results")
        .select("id")
        .eq("campaign_id", row.campaign_id)
        .eq("period_start", row.period_start)
        .eq("period_end", row.period_end),
      tenant,
    );
    query = row.campaign_asset_id ? query.eq("campaign_asset_id", row.campaign_asset_id) : query.is("campaign_asset_id", null);
    query = row.channel ? query.eq("channel", row.channel) : query.is("channel", null);

    // maybeSingle throws if >1 row matches the natural key. There's no DB unique
    // constraint, so a pre-existing duplicate would surface here as a loud error
    // (caught below) rather than silently picking one — acceptable for single-writer ingest.
    const { data: existing, error: lookupError } = await query.maybeSingle<{ id: string }>();
    if (lookupError) throw new Error(`campaign_results lookup: ${lookupError.message}`);

    if (existing) {
      const { error: updateError } = await applyOrgScope(
        client.from("campaign_results").update({ ...row, ...orgTenantFields(tenant) }).eq("id", existing.id),
        tenant,
      );
      if (updateError) throw new Error(`campaign_results update: ${updateError.message}`);
      updated += 1;
    } else {
      const { error: insertError } = await client.from("campaign_results").insert({ ...row, ...orgTenantFields(tenant) });
      if (insertError) throw new Error(`campaign_results insert: ${insertError.message}`);
      inserted += 1;
    }
  }

  return { inserted, updated };
}

function applyOrgScope<Query>(query: Query, tenant?: AgentTaskTenantFields): Query {
  if (!tenant) return query;
  return (query as { eq(column: string, value: string): Query }).eq("org_id", tenant.org_id);
}

function orgTenantFields(tenant?: AgentTaskTenantFields): Record<string, string> {
  return tenant ? { org_id: tenant.org_id } : {};
}
