import { type SupabaseClient } from "@supabase/supabase-js";

import { computeCampaignEconomics, type CampaignEconomics } from "@/domain";
import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "../supabase/server";

const WON_OUTCOME_STATUSES = ["won", "paid"];
const OPEN_JOB_STATUSES = ["pending", "scheduled", "in_progress"];

export type CampaignEconomicsReadModel =
  | (CampaignEconomics & {
      status: "live";
      selfReported: { wonRevenueCents: number; leads: number };
    })
  | { status: "unavailable"; message: string };

type LeadIdRow = { id: string };
type JobRow = { lead_id: string | null; status: string | null; estimated_revenue_cents: number | null };
type OutcomeRow = { lead_id: string | null; status: string | null; gross_revenue_cents: number | null };
type ResultRow = { spend_cents: number | null; won_revenue_cents: number | null; leads: number | null };

export async function getCampaignEconomics(
  campaignId: string,
  client?: SupabaseClient,
): Promise<CampaignEconomicsReadModel> {
  if (!client && !isSupabaseAdminConfigured()) {
    return { status: "unavailable", message: "Supabase env vars are not configured." };
  }

  try {
    const supabase = client ?? getSupabaseAdminClient();

    const leadsRes = await supabase.from("leads").select("id").eq("attributed_campaign_id", campaignId).limit(5000);
    if (leadsRes.error) throw new Error(`leads lookup: ${leadsRes.error.message}`);
    const leadIds = ((leadsRes.data ?? []) as LeadIdRow[]).map((row) => row.id);

    const [jobsRes, outcomesRes, resultsRes] = await Promise.all([
      supabase.from("jobs").select("lead_id,status,estimated_revenue_cents").in("lead_id", leadIds),
      supabase.from("outcomes").select("lead_id,status,gross_revenue_cents").in("lead_id", leadIds),
      supabase.from("campaign_results").select("spend_cents,won_revenue_cents,leads").eq("campaign_id", campaignId),
    ]);
    if (jobsRes.error) throw new Error(`jobs lookup: ${jobsRes.error.message}`);
    if (outcomesRes.error) throw new Error(`outcomes lookup: ${outcomesRes.error.message}`);
    if (resultsRes.error) throw new Error(`campaign_results lookup: ${resultsRes.error.message}`);

    const jobs = (jobsRes.data ?? []) as JobRow[];
    const outcomes = (outcomesRes.data ?? []) as OutcomeRow[];
    const results = (resultsRes.data ?? []) as ResultRow[];

    const won = outcomes.filter((o) => WON_OUTCOME_STATUSES.includes(o.status ?? ""));
    const wonRevenueCents = won.reduce((sum, o) => sum + (o.gross_revenue_cents ?? 0), 0);
    const openPipelineCents = jobs
      .filter((j) => OPEN_JOB_STATUSES.includes(j.status ?? ""))
      .reduce((sum, j) => sum + (j.estimated_revenue_cents ?? 0), 0);
    const spendCents = results.reduce((sum, r) => sum + (r.spend_cents ?? 0), 0);

    const economics = computeCampaignEconomics({
      attributedLeads: leadIds.length,
      wonRevenueCents,
      wonCount: won.length,
      openPipelineCents,
      spendCents,
    });

    return {
      status: "live",
      ...economics,
      selfReported: {
        wonRevenueCents: results.reduce((sum, r) => sum + (r.won_revenue_cents ?? 0), 0),
        leads: results.reduce((sum, r) => sum + (r.leads ?? 0), 0),
      },
    };
  } catch (error) {
    return { status: "unavailable", message: error instanceof Error ? error.message : "Campaign economics unavailable." };
  }
}
