// ---------------------------------------------------------------------------
// Campaign Performance panel — normalizes the (previously UI-less) economics
// engine into one shape the campaign detail view renders. Two live sources:
//   • "attributed" — real CRM attribution via getCampaignEconomics (won/paid
//     outcomes, open pipeline, spend) once Supabase has data for the campaign.
//   • "demo"       — the rich illustrative per-campaign detail used in local
//     preview / sales demos (Supabase unconfigured).
// Falls back to a "measuring" state (what we'll track, what's locked) so the
// tab is honest before any delivery/outcome data is attached. Read-only —
// nothing here implies an outbound send.
// ---------------------------------------------------------------------------

import { isDemoDataEnabled } from "@/lib/demo/demo-mode";

import { getCampaignAnalyticsDemoDetail, type CampaignAnalyticsDemoDetail } from "./campaign-demo-detail";
import { getCampaignEconomics, getCampaignTrendRows, type CampaignEconomicsReadModel } from "./attribution-read-model";
import { isSupabaseAdminConfigured } from "../supabase/server";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export type PerformanceKpi = {
  key: string;
  label: string;
  value: string;
  hint: string;
  delta?: string;
  deltaTone?: "ok" | "amber" | "red" | "neutral";
};

export type PerformanceChannelRow = {
  channel: string;
  leads: number;
  booked: number;
  revenue: string;
  spend: string;
  share: number;
};

export type PerformanceFunnelStage = { label: string; count: number };

export type PerformanceTrendPoint = { week: string; revenue: number; leads: number; booked: number };

export type PerformanceAssetRow = {
  id: string;
  title: string;
  channel: string;
  format: string;
  /** Provenance: real BSR media, AI-generated, composite, or stock. */
  source: string;
  status: string;
  impressions: number;
  clicks: number;
  leads: number;
  ctr: number;
};

export type CampaignPerformancePanel =
  | {
      status: "live";
      source: "demo" | "attributed";
      windowLabel: string;
      note: string;
      kpis: PerformanceKpi[];
      channels: PerformanceChannelRow[];
      funnel: PerformanceFunnelStage[];
      trend: PerformanceTrendPoint[];
      assets: PerformanceAssetRow[];
    }
  | { status: "measuring"; message: string };

const USD = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const NUM = new Intl.NumberFormat("en-US");
const usd = (cents: number) => USD.format(cents / 100);

const MEASURING_MESSAGE =
  "No delivery or outcome data is attached to this campaign yet. Once approved sending, publishing, or ad results and booked-job outcomes are linked, live attribution appears here.";

/** Map the illustrative demo detail into the shared panel shape. */
export function buildDemoPanel(detail: CampaignAnalyticsDemoDetail): CampaignPerformancePanel {
  return {
    status: "live",
    source: "demo",
    windowLabel: detail.windowLabel,
    note: "Illustrative demo data — connect delivery results and CRM outcomes for live attribution.",
    kpis: detail.kpis.map((k) => ({
      key: k.key,
      label: k.label,
      value: k.value,
      hint: k.hint,
      delta: k.delta,
      deltaTone: k.deltaTone,
    })),
    channels: detail.channels.map((c) => ({
      channel: c.channel,
      leads: c.leads,
      booked: c.booked,
      revenue: usd(c.revenueCents),
      spend: c.spendCents > 0 ? usd(c.spendCents) : "—",
      share: c.share,
    })),
    funnel: detail.funnel.map((f) => ({ label: f.label, count: f.count })),
    trend: detail.trend.map((t) => ({ week: t.week, revenue: t.revenue, leads: t.leads, booked: t.booked })),
    assets: detail.assets.map((a) => ({
      id: a.id,
      title: a.title,
      channel: a.channel,
      format: a.format,
      source: a.source,
      status: a.status,
      impressions: a.impressions,
      clicks: a.clicks,
      leads: a.leads,
      ctr: a.ctr,
    })),
  };
}

/** Pure: bucket attributed-lead dates and won-revenue events into `weeks` weekly
 *  points ending at `nowMs` (oldest first). Revenue is whole dollars, matching the
 *  demo trend the chart already renders. Unparseable/out-of-window dates are skipped. */
export function buildWeeklyTrend(
  leadDates: Array<string | null>,
  wonEvents: Array<{ at: string | null; cents: number }>,
  nowMs: number,
  weeks: number,
): PerformanceTrendPoint[] {
  const points: PerformanceTrendPoint[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const start = nowMs - i * WEEK_MS - WEEK_MS;
    const label = new Date(start + WEEK_MS).toLocaleDateString("en-US", { month: "numeric", day: "numeric" });
    points.push({ week: label, revenue: 0, leads: 0, booked: 0 });
  }
  const indexOf = (at: string | null): number => {
    if (!at) return -1;
    const t = Date.parse(at);
    if (Number.isNaN(t)) return -1;
    const weeksAgo = Math.floor((nowMs - t) / WEEK_MS);
    if (weeksAgo < 0 || weeksAgo >= weeks) return -1;
    return weeks - 1 - weeksAgo;
  };
  for (const d of leadDates) {
    const i = indexOf(d);
    if (i >= 0) points[i].leads += 1;
  }
  for (const e of wonEvents) {
    const i = indexOf(e.at);
    if (i >= 0) {
      points[i].revenue += Math.round(e.cents / 100);
      points[i].booked += 1;
    }
  }
  return points;
}

/** Map real CRM attribution economics into the shared panel shape. */
export function buildAttributedPanel(
  econ: Extract<CampaignEconomicsReadModel, { status: "live" }>,
  trend: PerformanceTrendPoint[] = [],
): CampaignPerformancePanel {
  const kpis: PerformanceKpi[] = [
    { key: "realized", label: "Realized revenue", value: usd(econ.realizedRevenueCents), hint: "won & paid outcomes" },
    { key: "pipeline", label: "Open pipeline", value: usd(econ.pipelineRevenueCents), hint: "estimated on open jobs" },
    { key: "leads", label: "Attributed leads", value: NUM.format(econ.attributedLeads), hint: "linked to this campaign" },
    { key: "booked", label: "Booked jobs", value: NUM.format(econ.wonCount), hint: "won or paid" },
    {
      key: "roas",
      label: "ROAS",
      value: econ.roas != null ? `${econ.roas.toFixed(2)}×` : "—",
      hint: econ.roas != null ? "realized revenue / spend" : "no spend recorded",
    },
    {
      key: "spend",
      label: "Spend",
      value: usd(econ.spendCents),
      hint: econ.cac != null ? `${usd(econ.cac)} per booked job` : econ.cpl != null ? `${usd(econ.cpl)} per lead` : "no spend recorded",
    },
  ];

  return {
    status: "live",
    source: "attributed",
    windowLabel: "All time",
    note: "Attributed from booked jobs and outcomes linked to this campaign in CRM. ROAS reflects realized revenue only — pipeline is shown separately.",
    kpis,
    channels: [],
    funnel: [
      { label: "Attributed leads", count: econ.attributedLeads },
      { label: "Booked jobs", count: econ.wonCount },
    ],
    // Weekly trend is derived from attributed leads + won outcomes (see
    // getCampaignTrendRows). Per-asset delivery metrics still require attached
    // ad-platform / sending results and are surfaced once that pipeline lands.
    trend,
    assets: [],
  };
}

/** True when the live economics carry any real signal worth surfacing. */
function hasAttributionSignal(econ: Extract<CampaignEconomicsReadModel, { status: "live" }>): boolean {
  return econ.attributedLeads > 0 || econ.spendCents > 0 || econ.realizedRevenueCents > 0 || econ.pipelineRevenueCents > 0;
}

export async function getCampaignPerformancePanel(campaignId: string): Promise<CampaignPerformancePanel> {
  // Live attribution first when Supabase is configured and the campaign has signal.
  if (isSupabaseAdminConfigured()) {
    const econ = await getCampaignEconomics(campaignId);
    if (econ.status === "live" && hasAttributionSignal(econ)) {
      const rows = await getCampaignTrendRows(campaignId);
      let trend: PerformanceTrendPoint[] = [];
      if (rows.status === "live") {
        const built = buildWeeklyTrend(rows.leadDates, rows.wonEvents, Date.now(), 12);
        // Only surface the chart when there's real signal in-window — a flat zero
        // line would misrepresent a campaign whose activity predates the window.
        if (built.some((p) => p.revenue > 0 || p.leads > 0)) trend = built;
      }
      return buildAttributedPanel(econ, trend);
    }
  }

  // Local preview / unconfigured: fall back to the illustrative demo detail.
  if (isDemoDataEnabled()) {
    const demo = getCampaignAnalyticsDemoDetail(campaignId);
    if (demo) return buildDemoPanel(demo);
  }

  return { status: "measuring", message: MEASURING_MESSAGE };
}
