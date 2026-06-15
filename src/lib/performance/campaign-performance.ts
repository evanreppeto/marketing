import { type SupabaseClient } from "@supabase/supabase-js";

import { summarizeCampaignMoney, summarizeCampaignTraffic, type CampaignMoney, type CampaignTraffic } from "@/domain";
import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "../supabase/server";

type OutcomeRow = {
  lead_id: string | null;
  company_id: string | null;
  status: string | null;
  gross_revenue_cents: number | null;
  gross_margin_cents: number | null;
};

type JobRow = {
  lead_id: string | null;
  status: string | null;
  estimated_revenue_cents: number | null;
};

type EventRow = {
  event_type: string | null;
  channel: string | null;
};

export type CampaignPerformance =
  | { status: "live"; money: CampaignMoney; traffic: CampaignTraffic; trafficTracked: boolean }
  | { status: "unavailable"; message: string };

/** Per-campaign money + traffic. Money attributes via the campaign's lead_id/company_id
 *  to outcomes (revenue/margin) and jobs (estimated pipeline); traffic counts the
 *  campaign's engagement_events. Honest empties where joins/tables are missing. */
export async function getCampaignPerformance(campaignId: string, client?: SupabaseClient): Promise<CampaignPerformance> {
  if (!client && !isSupabaseAdminConfigured()) {
    return { status: "unavailable", message: "Supabase env vars are not configured." };
  }

  try {
    const supabase = client ?? getSupabaseAdminClient();

    const campaignResult = await supabase
      .from("campaigns")
      .select("id,lead_id,company_id")
      .eq("id", campaignId)
      .maybeSingle();
    if (campaignResult.error) throw new Error(`campaigns: ${campaignResult.error.message}`);
    const campaign = campaignResult.data as { id: string; lead_id: string | null; company_id: string | null } | null;
    if (!campaign) {
      return { status: "unavailable", message: "Campaign not found." };
    }

    const { lead_id: leadId, company_id: companyId } = campaign;

    const outcomesPromise = (async (): Promise<OutcomeRow[]> => {
      if (!leadId && !companyId) return [];
      let query = supabase
        .from("outcomes")
        .select("lead_id,company_id,status,gross_revenue_cents,gross_margin_cents")
        .limit(1000);
      if (leadId && companyId) {
        query = query.or(`lead_id.eq.${leadId},company_id.eq.${companyId}`);
      } else if (leadId) {
        query = query.eq("lead_id", leadId);
      } else if (companyId) {
        query = query.eq("company_id", companyId);
      }
      const res = await query;
      if (res.error) throw new Error(`outcomes: ${res.error.message}`);
      return (res.data ?? []) as OutcomeRow[];
    })();

    const jobsPromise = (async (): Promise<JobRow[]> => {
      if (!leadId) return [];
      const res = await supabase
        .from("jobs")
        .select("lead_id,status,estimated_revenue_cents")
        .eq("lead_id", leadId)
        .limit(1000);
      if (res.error) throw new Error(`jobs: ${res.error.message}`);
      return (res.data ?? []) as JobRow[];
    })();

    // Optional table: a query error here means engagement_events isn't available,
    // which is a known/tolerated state — NOT a hard failure.
    const eventsResult = await supabase
      .from("engagement_events")
      .select("event_type,channel")
      .eq("campaign_id", campaignId)
      .limit(1000);
    const trafficTracked = !eventsResult.error;
    const eventRows = trafficTracked ? ((eventsResult.data ?? []) as EventRow[]) : [];

    const [outcomeRows, jobRows] = await Promise.all([outcomesPromise, jobsPromise]);

    return {
      status: "live",
      money: summarizeCampaignMoney(outcomeRows, jobRows),
      traffic: summarizeCampaignTraffic(eventRows),
      trafficTracked,
    };
  } catch (error) {
    return { status: "unavailable", message: error instanceof Error ? error.message : "Campaign performance is unavailable." };
  }
}
