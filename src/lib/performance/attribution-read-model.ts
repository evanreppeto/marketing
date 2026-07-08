import { type SupabaseClient } from "@supabase/supabase-js";

import { computeCampaignEconomics, type CampaignEconomics } from "@/domain";
import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "../supabase/server";

const WON_OUTCOME_STATUSES = ["won", "paid"];
const OPEN_JOB_STATUSES = ["pending", "scheduled", "in_progress"];
// Explicit row caps so totals are never silently truncated by PostgREST's
// default page size (1000). A campaign's attributed leads are bounded, and
// their jobs/outcomes are a small multiple of that.
const MAX_LEADS = 5000;
const MAX_FANOUT_ROWS = 20000;
const MAX_RESULT_ROWS = 1000;

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

    const leadsRes = await supabase.from("leads").select("id").eq("attributed_campaign_id", campaignId).limit(MAX_LEADS);
    if (leadsRes.error) throw new Error(`leads lookup: ${leadsRes.error.message}`);
    const leadIds = ((leadsRes.data ?? []) as LeadIdRow[]).map((row) => row.id);

    // `.in("lead_id", [])` is valid in PostgREST — it returns an empty set, not an
    // error — so a campaign with zero attributed leads correctly yields zeroed economics.
    const [jobsRes, outcomesRes, resultsRes] = await Promise.all([
      supabase.from("jobs").select("lead_id,status,estimated_revenue_cents").in("lead_id", leadIds).limit(MAX_FANOUT_ROWS),
      supabase.from("outcomes").select("lead_id,status,gross_revenue_cents").in("lead_id", leadIds).limit(MAX_FANOUT_ROWS),
      supabase.from("campaign_results").select("spend_cents,won_revenue_cents,leads").eq("campaign_id", campaignId).limit(MAX_RESULT_ROWS),
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
      // selfReported sums campaign_results across ALL periods for the campaign —
      // an all-time total, consistent with the all-time realized figures above.
      // A date-windowed view would add period_start/period_end filters here.
      selfReported: {
        wonRevenueCents: results.reduce((sum, r) => sum + (r.won_revenue_cents ?? 0), 0),
        leads: results.reduce((sum, r) => sum + (r.leads ?? 0), 0),
      },
    };
  } catch (error) {
    return { status: "unavailable", message: error instanceof Error ? error.message : "Campaign economics unavailable." };
  }
}

/** Dated rows for a campaign's per-week trend: attributed-lead created dates and
 *  won/paid revenue events. Kept separate from getCampaignEconomics so the
 *  economics path stays a single round of queries. */
export type CampaignTrendRows =
  | { status: "live"; leadDates: (string | null)[]; wonEvents: { at: string | null; cents: number }[] }
  | { status: "unavailable"; message: string };

type LeadDateRow = { id: string; created_at: string | null };
type OutcomeDateRow = { status: string | null; gross_revenue_cents: number | null; closed_at: string | null; created_at: string | null };

export async function getCampaignTrendRows(campaignId: string, client?: SupabaseClient): Promise<CampaignTrendRows> {
  if (!client && !isSupabaseAdminConfigured()) {
    return { status: "unavailable", message: "Supabase env vars are not configured." };
  }

  try {
    const supabase = client ?? getSupabaseAdminClient();

    const leadsRes = await supabase.from("leads").select("id,created_at").eq("attributed_campaign_id", campaignId).limit(MAX_LEADS);
    if (leadsRes.error) throw new Error(`leads lookup: ${leadsRes.error.message}`);
    const leadRows = (leadsRes.data ?? []) as LeadDateRow[];
    const leadIds = leadRows.map((row) => row.id);

    const outcomesRes = await supabase
      .from("outcomes")
      .select("status,gross_revenue_cents,closed_at,created_at")
      .in("lead_id", leadIds)
      .limit(MAX_FANOUT_ROWS);
    if (outcomesRes.error) throw new Error(`outcomes lookup: ${outcomesRes.error.message}`);
    const outcomeRows = (outcomesRes.data ?? []) as OutcomeDateRow[];

    const wonEvents = outcomeRows
      .filter((o) => WON_OUTCOME_STATUSES.includes(o.status ?? ""))
      .map((o) => ({ at: o.closed_at ?? o.created_at, cents: o.gross_revenue_cents ?? 0 }));

    return { status: "live", leadDates: leadRows.map((row) => row.created_at), wonEvents };
  } catch (error) {
    return { status: "unavailable", message: error instanceof Error ? error.message : "Campaign trend unavailable." };
  }
}
