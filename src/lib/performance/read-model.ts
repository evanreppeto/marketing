import { type SupabaseClient } from "@supabase/supabase-js";

import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "../supabase/server";

export type PerformanceTone = "amber" | "green" | "red" | "blue" | "gray";

export type PerformanceMetric = {
  label: string;
  value: number | string;
  detail: string;
  tone: PerformanceTone;
};

export type PerformanceBreakdown = {
  label: string;
  value: number | string;
  detail: string;
  tone: PerformanceTone;
};

export type PerformanceContract = {
  area: string;
  currentSignal: string;
  missingFields: string;
  nextBackendStep: string;
};

export type PerformanceReadModel =
  | {
      status: "live";
      metrics: PerformanceMetric[];
      leadVolumeByPersona: PerformanceBreakdown[];
      leadVolumeBySource: PerformanceBreakdown[];
      conversionSignals: PerformanceBreakdown[];
      funnelStages: { label: string; count: number }[];
      campaignSignals: PerformanceBreakdown[];
      partnerSignals: PerformanceBreakdown[];
      revenueByPersona: PerformanceBreakdown[];
      ctaSignals: PerformanceBreakdown[];
      contracts: PerformanceContract[];
    }
  | {
      status: "unavailable";
      message: string;
    };

type LeadRow = {
  id: string;
  persona: string | null;
  source: string | null;
  status: string | null;
  lead_score: number | null;
  created_at: string | null;
  updated_at: string | null;
};

type JobRow = {
  id: string;
  lead_id: string | null;
  persona: string | null;
  status: string | null;
  estimated_revenue_cents: number | null;
  created_at: string | null;
  updated_at: string | null;
};

type OutcomeRow = {
  id: string;
  lead_id: string | null;
  company_id: string | null;
  persona: string | null;
  status: string | null;
  gross_revenue_cents: number | null;
  gross_margin_cents: number | null;
  closed_at: string | null;
  created_at: string | null;
};

type CampaignRow = {
  id: string;
  name: string;
  persona: string | null;
  status: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type CampaignAssetRow = {
  id: string;
  campaign_id: string | null;
  asset_type: string | null;
  channel: string | null;
  status: string | null;
};

type ApprovalRow = {
  id: string;
  campaign_id: string | null;
  item_type: string | null;
  status: string | null;
  risk_level: string | null;
};

type CompanyRow = {
  id: string;
  persona: string | null;
  status: string | null;
  partner_tier: string | null;
  metadata: unknown;
};

type EngagementEventRow = {
  id: string;
  event_type: string | null;
  channel: string | null;
  campaign_id: string | null;
  lead_id: string | null;
  created_at: string | null;
};

export async function getPerformanceReadModel(client?: SupabaseClient): Promise<PerformanceReadModel> {
  if (!client && !isSupabaseAdminConfigured()) {
    return { status: "unavailable", message: "Supabase env vars are not configured." };
  }

  try {
    const supabase = client ?? getSupabaseAdminClient();
    const [leads, jobs, outcomes, campaigns, assets, approvals, companies, events] = await Promise.all([
      supabase.from("leads").select("id,persona,source,status,lead_score,created_at,updated_at").limit(1000),
      supabase.from("jobs").select("id,lead_id,persona,status,estimated_revenue_cents,created_at,updated_at").limit(1000),
      supabase.from("outcomes").select("id,lead_id,company_id,persona,status,gross_revenue_cents,gross_margin_cents,closed_at,created_at").limit(1000),
      supabase.from("campaigns").select("id,name,persona,status,created_at,updated_at").limit(1000),
      supabase.from("campaign_assets").select("id,campaign_id,asset_type,channel,status").limit(1000),
      supabase.from("approval_items").select("id,campaign_id,item_type,status,risk_level").limit(1000),
      supabase.from("companies").select("id,persona,status,partner_tier,metadata").limit(1000),
      supabase.from("engagement_events").select("id,event_type,channel,campaign_id,lead_id,created_at").limit(1000),
    ]);

    assertResult("leads", leads.error);
    assertResult("jobs", jobs.error);
    assertResult("outcomes", outcomes.error);
    assertResult("campaigns", campaigns.error);
    assertResult("campaign_assets", assets.error);
    assertResult("approval_items", approvals.error);
    assertResult("companies", companies.error);
    const optionalEventsMissing = Boolean(events.error);

    const leadRows = (leads.data ?? []) as LeadRow[];
    const jobRows = (jobs.data ?? []) as JobRow[];
    const outcomeRows = (outcomes.data ?? []) as OutcomeRow[];
    const campaignRows = (campaigns.data ?? []) as CampaignRow[];
    const assetRows = (assets.data ?? []) as CampaignAssetRow[];
    const approvalRows = (approvals.data ?? []) as ApprovalRow[];
    const companyRows = (companies.data ?? []) as CompanyRow[];
    const eventRows = optionalEventsMissing ? [] : ((events.data ?? []) as EngagementEventRow[]);

    const wonOutcomes = outcomeRows.filter((outcome) => ["won", "closed_won", "paid"].includes(outcome.status ?? ""));
    const linkedRevenue = outcomeRows.reduce((sum, outcome) => sum + (outcome.gross_revenue_cents ?? 0), 0);
    return {
      status: "live",
      metrics: [
        { label: "Lead records", value: leadRows.length, detail: "Current CRM lead volume", tone: leadRows.length > 0 ? "blue" : "gray" },
        { label: "Job records", value: jobRows.length, detail: "Booking proxy until booked_at exists", tone: jobRows.length > 0 ? "green" : "gray" },
        { label: "Campaign packages", value: campaignRows.length, detail: "Drafted or active packages", tone: campaignRows.length > 0 ? "blue" : "gray" },
        { label: "Revenue linked", value: formatMoney(linkedRevenue), detail: `${wonOutcomes.length} won/paid outcomes`, tone: linkedRevenue > 0 ? "green" : "gray" },
      ],
      leadVolumeByPersona: breakdownFromCounts(countBy(leadRows, (lead) => lead.persona ?? "unassigned_persona"), "lead"),
      leadVolumeBySource: breakdownFromCounts(countBy(leadRows, (lead) => lead.source ?? "unknown_source"), "lead"),
      conversionSignals: buildConversionSignals(leadRows, jobRows, outcomeRows),
      funnelStages: [
        { label: "Leads", count: leadRows.length },
        { label: "Bookings", count: jobRows.length },
        { label: "Won", count: wonOutcomes.length },
      ],
      campaignSignals: buildCampaignSignals(campaignRows, assetRows, approvalRows),
      partnerSignals: buildPartnerSignals(companyRows, outcomeRows),
      revenueByPersona: buildRevenueByPersona(outcomeRows),
      ctaSignals: buildCtaSignals(eventRows),
      contracts: buildContracts(),
    };
  } catch (error) {
    return { status: "unavailable", message: error instanceof Error ? error.message : "Performance data is unavailable." };
  }
}

function buildConversionSignals(leads: LeadRow[], jobs: JobRow[], outcomes: OutcomeRow[]): PerformanceBreakdown[] {
  const leadCount = leads.length;
  const jobCount = jobs.length;
  const estimateRevenue = jobs.reduce((sum, job) => sum + (job.estimated_revenue_cents ?? 0), 0);
  const wonOutcomes = outcomes.filter((outcome) => ["won", "closed_won", "paid"].includes(outcome.status ?? ""));

  return [
    {
      label: "Booking rate proxy",
      value: leadCount > 0 ? percent(jobCount / leadCount) : "Missing",
      detail: "Uses job records divided by lead records until booked_at exists.",
      tone: leadCount > 0 && jobCount > 0 ? "green" : "amber",
    },
    {
      label: "Estimate pipeline",
      value: formatMoney(estimateRevenue),
      detail: "Uses estimated_revenue_cents on jobs.",
      tone: estimateRevenue > 0 ? "green" : "gray",
    },
    {
      label: "Estimate close rate proxy",
      value: jobCount > 0 ? percent(wonOutcomes.length / jobCount) : "Missing",
      detail: "Uses won/paid outcomes divided by job records until estimate status timestamps exist.",
      tone: wonOutcomes.length > 0 ? "green" : "amber",
    },
  ];
}

function buildCampaignSignals(campaigns: CampaignRow[], assets: CampaignAssetRow[], approvals: ApprovalRow[]): PerformanceBreakdown[] {
  const activeCampaigns = campaigns.filter((campaign) => ["approved", "scheduled", "running", "active"].includes(campaign.status ?? ""));
  const waitingApprovals = approvals.filter((approval) => isWaitingApproval(approval.status));
  const mediaAssets = assets.filter((asset) => /image|video|creative|media|ad/i.test(`${asset.asset_type ?? ""} ${asset.channel ?? ""}`));

  return [
    { label: "Campaign packages", value: campaigns.length, detail: "Campaign records in Supabase.", tone: campaigns.length > 0 ? "blue" : "gray" },
    { label: "Approved/running", value: activeCampaigns.length, detail: "Execution status only; no publishing is enabled here.", tone: activeCampaigns.length > 0 ? "green" : "gray" },
    { label: "Creative assets", value: assets.length, detail: `${mediaAssets.length} visual/media-like assets detected.`, tone: assets.length > 0 ? "blue" : "gray" },
    { label: "Approvals waiting", value: waitingApprovals.length, detail: "Human approval gate volume.", tone: waitingApprovals.length > 0 ? "amber" : "green" },
    {
      label: "Cost per booked job",
      value: "Missing",
      detail: "Needs spend_cents and booked_job_count by campaign before this KPI is real.",
      tone: "amber",
    },
  ];
}

function buildPartnerSignals(companies: CompanyRow[], outcomes: OutcomeRow[]): PerformanceBreakdown[] {
  const partnerCompanies = companies.filter((company) => Boolean(company.partner_tier) || isPartnerPersona(company.persona));
  const tiered = partnerCompanies.filter((company) => Boolean(company.partner_tier));
  const referralRevenue = outcomes.reduce((sum, outcome) => sum + (outcome.gross_revenue_cents ?? 0), 0);

  return [
    { label: "Partner companies", value: partnerCompanies.length, detail: "Partner persona or partner tier records.", tone: partnerCompanies.length > 0 ? "blue" : "gray" },
    { label: "Tiered partners", value: tiered.length, detail: "Companies with partner_tier populated.", tone: tiered.length > 0 ? "green" : "amber" },
    {
      label: "Partner referrals",
      value: "Missing",
      detail: "Needs partner_referrals rows or referred lead/job ids before referral volume is trustworthy.",
      tone: "amber",
    },
    {
      label: "Referral conversion",
      value: "Missing",
      detail: "Needs referred_lead_ids joined to booked jobs and outcomes.",
      tone: "amber",
    },
    {
      label: "Referral revenue",
      value: referralRevenue > 0 ? formatMoney(referralRevenue) : "Missing",
      detail: "Needs explicit referral attribution before this becomes true partner ROI.",
      tone: referralRevenue > 0 ? "green" : "amber",
    },
  ];
}

function buildRevenueByPersona(outcomes: OutcomeRow[]): PerformanceBreakdown[] {
  const revenue = new Map<string, number>();
  for (const outcome of outcomes) {
    const persona = outcome.persona ?? "unassigned_persona";
    revenue.set(persona, (revenue.get(persona) ?? 0) + (outcome.gross_revenue_cents ?? 0));
  }
  return [...revenue.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([persona, cents]) => ({
      label: titleize(persona),
      // Whole dollars (number) so the chart can plot it; the UI re-applies $ formatting.
      // Sub-dollar precision is intentionally dropped — bars don't need cents.
      value: Math.round(cents / 100),
      detail: "gross_revenue_cents grouped by outcome persona.",
      tone: cents > 0 ? "green" : "gray",
    }));
}

function buildCtaSignals(events: EngagementEventRow[]): PerformanceBreakdown[] {
  const ctaLike = events.filter((event) => /cta|form|photo|upload|landing|submit/i.test(`${event.event_type ?? ""} ${event.channel ?? ""}`));
  const byType = breakdownFromCounts(countBy(ctaLike, (event) => event.event_type ?? "unknown_event"), "event");
  return byType.length > 0
    ? byType
    : [
        {
          label: "CTA/form/photo-upload conversion",
          value: "Missing",
          detail: "Needs engagement_events with CTA, form, landing, and photo upload event types.",
          tone: "amber",
        },
      ];
}

function buildContracts(): PerformanceContract[] {
  return [
    {
      area: "Lead conversion",
      currentSignal: "leads, jobs, outcomes",
      missingFields: "booked_at, estimate_sent_at, estimate_approved_at, lost_reason",
      nextBackendStep: "Add lead-to-job conversion timestamps and close reasons.",
    },
    {
      area: "Campaign performance",
      currentSignal: "campaigns, campaign_assets, approval_items",
      missingFields: "impressions, clicks, spend_cents, form_submissions, booked_jobs, cost_per_booked_job_cents",
      nextBackendStep: "Create campaign_results rows keyed by campaign_id and asset_id.",
    },
    {
      area: "Partner attribution",
      currentSignal: "companies.partner_tier",
      missingFields: "partner_type, referral_count, referred_lead_ids, referred_job_ids, referral_revenue_cents",
      nextBackendStep: "Add partner attribution fields or a partner_referrals table.",
    },
    {
      area: "CTA and landing events",
      currentSignal: "engagement_events if present",
      missingFields: "cta_label, route, persona, source_campaign_id, photo_upload_count",
      nextBackendStep: "Track internal CTA/form/photo-upload events. Do not publish pages from this app.",
    },
    {
      area: "Revenue intelligence",
      currentSignal: "outcomes.gross_revenue_cents and gross_margin_cents",
      missingFields: "campaign_id, partner_company_id, attribution_confidence, attribution_method",
      nextBackendStep: "Join outcomes to leads, campaigns, partners, and source records.",
    },
  ];
}

function breakdownFromCounts(counts: Map<string, number>, noun: string): PerformanceBreakdown[] {
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([label, value]) => ({
      label: titleize(label),
      value,
      detail: `${value} ${noun}${value === 1 ? "" : "s"} in current data.`,
      tone: value > 0 ? "blue" : "gray",
    }));
}

function countBy<T>(rows: T[], pick: (row: T) => string) {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const key = pick(row);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

function isWaitingApproval(status: string | null) {
  return ["needs_compliance", "pending_approval", "pending_owner_approval", "revision_requested"].includes(status ?? "");
}

function isPartnerPersona(persona: string | null) {
  return /partner|property_manager|insurance|agent|landlord|hoa|gc|remodeler/i.test(persona ?? "");
}

function percent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function formatMoney(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function titleize(value: string) {
  return value
    .replace(/^persona_/, "")
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function assertResult(table: string, error: { message?: string } | null) {
  if (error) {
    throw new Error(`${table} lookup failed: ${error.message ?? "Unknown Supabase error"}`);
  }
}
