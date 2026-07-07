// Analytics Overview read-model — computes the Performance-overview numbers the
// mockup shows (KPI deltas, a 30-day trend with a previous-period overlay, the
// lead→job→won funnel, and revenue-by-persona / leads-by-source breakdowns)
// straight from real leads / jobs / outcomes rows. Everything is derived, so it
// degrades gracefully when the tables are sparse or unconfigured.
import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/server";

const DAY = 86400000;
const WINDOW = 30; // days per period

export type TrendKey = "revenue" | "leads" | "bookings";
export type KpiTag = "wired" | "partial" | "sync";

export type OverviewKpi = {
  label: string;
  value: string;
  deltaLabel: string; // e.g. "+12.5%" or "— est."
  dir: "up" | "dn" | "flat";
  prevLabel: string;
  tag: KpiTag;
  tagLabel: string;
};
export type TrendSeries = { cur: number[]; prev: number[] };
export type BreakdownRow = { label: string; count: number; width: number; dot: string; valueLabel?: string };
export type FunnelStage = { label: string; count: number; width: number; note: string };

export type AnalyticsOverview = {
  kpis: OverviewKpi[];
  trend: Record<TrendKey, TrendSeries>;
  trendLabels: string[];
  funnel: FunnelStage[];
  revenueByPersona: BreakdownRow[];
  leadsBySource: BreakdownRow[];
  arcRead: { text: string; cites: string[]; rec: string };
  hasHistory: boolean;
};

const PERSONA_DOTS = ["#c8a24a", "#7fb89a", "#88b6d8", "#9678c8", "#cc6a6a", "#d8935a", "#6ea8a0", "#b08fd0"];

function humanizePersona(p: string): string {
  const s = (p || "").replace(/^persona[\s_-]+/i, "").replace(/[_-]+/g, " ").trim();
  if (!s || /^unassigned/i.test(s)) return "Unassigned";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function pct(cur: number, prev: number): { deltaLabel: string; dir: "up" | "dn" | "flat" } {
  if (prev <= 0) return { deltaLabel: cur > 0 ? "new" : "—", dir: cur > 0 ? "up" : "flat" };
  const d = ((cur - prev) / prev) * 100;
  if (Math.abs(d) < 0.5) return { deltaLabel: "flat", dir: "flat" };
  return { deltaLabel: `${d > 0 ? "+" : ""}${d.toFixed(1)}%`, dir: d > 0 ? "up" : "dn" };
}

function money(cents: number): string {
  const dollars = Math.round(cents / 100);
  if (dollars >= 1000) return `$${Math.round(dollars / 1000)}k`;
  return `$${dollars.toLocaleString()}`;
}

type LeadRow = { created_at: string; persona: string | null; source: string | null };
type JobRow = { created_at: string };
type OutcomeRow = { created_at: string; persona: string | null; gross_revenue_cents: number | null; status: string };

function emptyOverview(): AnalyticsOverview {
  const zero = () => ({ cur: Array(WINDOW).fill(0), prev: Array(WINDOW).fill(0) });
  return {
    kpis: [],
    trend: { revenue: zero(), leads: zero(), bookings: zero() },
    trendLabels: [],
    funnel: [],
    revenueByPersona: [],
    leadsBySource: [],
    arcRead: { text: "", cites: [], rec: "" },
    hasHistory: false,
  };
}

export async function getAnalyticsOverview(orgId: string): Promise<AnalyticsOverview> {
  if (!isSupabaseAdminConfigured()) return emptyOverview();
  const admin = getSupabaseAdminClient();
  const since = new Date(Date.now() - 2 * WINDOW * DAY).toISOString();

  const [leadsRes, jobsRes, outcomesRes] = await Promise.all([
    admin.from("leads").select("created_at, persona, source").eq("org_id", orgId).gte("created_at", since),
    admin.from("jobs").select("created_at").eq("org_id", orgId).gte("created_at", since),
    admin.from("outcomes").select("created_at, persona, gross_revenue_cents, status").eq("org_id", orgId).gte("created_at", since),
  ]);
  const leads = (leadsRes.data ?? []) as LeadRow[];
  const jobs = (jobsRes.data ?? []) as JobRow[];
  const outcomes = (outcomesRes.data ?? []) as OutcomeRow[];

  // Bucket anchors: 30 daily buckets ending today; previous window is the 30 days before.
  const startOfToday = Math.floor(Date.now() / DAY) * DAY;
  const curStart = startOfToday - (WINDOW - 1) * DAY;
  const prevStart = curStart - WINDOW * DAY;
  const bucket = (iso: string): { period: "cur" | "prev" | null; idx: number } => {
    const t = new Date(iso).getTime();
    if (!Number.isFinite(t)) return { period: null, idx: -1 };
    if (t >= curStart) {
      const idx = Math.floor((t - curStart) / DAY);
      return idx >= 0 && idx < WINDOW ? { period: "cur", idx } : { period: null, idx: -1 };
    }
    if (t >= prevStart) {
      const idx = Math.floor((t - prevStart) / DAY);
      return idx >= 0 && idx < WINDOW ? { period: "prev", idx } : { period: null, idx: -1 };
    }
    return { period: null, idx: -1 };
  };

  const series = (): TrendSeries => ({ cur: Array(WINDOW).fill(0), prev: Array(WINDOW).fill(0) });
  const trend: Record<TrendKey, TrendSeries> = { revenue: series(), leads: series(), bookings: series() };

  for (const l of leads) {
    const b = bucket(l.created_at);
    if (b.period) trend.leads[b.period][b.idx] += 1;
  }
  for (const j of jobs) {
    const b = bucket(j.created_at);
    if (b.period) trend.bookings[b.period][b.idx] += 1;
  }
  const isWin = (o: OutcomeRow) => o.status === "won" || o.status === "paid";
  for (const o of outcomes) {
    if (!isWin(o)) continue;
    const b = bucket(o.created_at);
    if (b.period) trend.revenue[b.period][b.idx] += o.gross_revenue_cents ?? 0;
  }

  const sum = (a: number[]) => a.reduce((s, n) => s + n, 0);
  const curLeads = sum(trend.leads.cur);
  const prevLeads = sum(trend.leads.prev);
  const curJobs = sum(trend.bookings.cur);
  const prevJobs = sum(trend.bookings.prev);
  const curRev = sum(trend.revenue.cur);
  const prevRev = sum(trend.revenue.prev);
  const curWon = outcomes.filter((o) => isWin(o) && bucket(o.created_at).period === "cur").length;
  const prevWon = outcomes.filter((o) => isWin(o) && bucket(o.created_at).period === "prev").length;

  const hasHistory = curLeads + prevLeads + curJobs + curRev > 0;

  const leadsDelta = pct(curLeads, prevLeads);
  const jobsDelta = pct(curJobs, prevJobs);
  const revDelta = pct(curRev, prevRev);

  const kpis: OverviewKpi[] = [
    { label: "Leads", value: curLeads.toLocaleString(), ...leadsDelta, prevLabel: `${prevLeads} prev`, tag: "wired", tagLabel: "wired" },
    { label: "Booked jobs", value: curJobs.toLocaleString(), ...jobsDelta, prevLabel: `${prevJobs} prev`, tag: "wired", tagLabel: "wired" },
    { label: "Won revenue", value: money(curRev), ...revDelta, prevLabel: `${money(prevRev)} prev`, tag: "wired", tagLabel: "wired" },
    { label: "Reply rate", value: "—", deltaLabel: "needs sends", dir: "flat", prevLabel: "no send denominator", tag: "partial", tagLabel: "partial" },
    { label: "Cost / job", value: "—", deltaLabel: "— est.", dir: "flat", prevLabel: "needs spend feed", tag: "sync", tagLabel: "needs sync" },
  ];

  // Funnel (current window): leads -> booked -> won.
  const funnelMax = Math.max(1, curLeads);
  const funnel: FunnelStage[] = [
    { label: "Leads", count: curLeads, width: 100, note: "" },
    { label: "Booked jobs", count: curJobs, width: Math.round((curJobs / funnelMax) * 100), note: curLeads ? `${((curJobs / curLeads) * 100).toFixed(1)}%` : "" },
    { label: "Won", count: curWon, width: Math.round((curWon / funnelMax) * 100), note: curLeads ? `${((curWon / curLeads) * 100).toFixed(1)}%` : "" },
  ];

  // Revenue by persona (current window, won/paid).
  const revByPersona = new Map<string, number>();
  for (const o of outcomes) {
    if (!isWin(o) || bucket(o.created_at).period !== "cur") continue;
    const label = humanizePersona(o.persona ?? "");
    revByPersona.set(label, (revByPersona.get(label) ?? 0) + (o.gross_revenue_cents ?? 0));
  }
  const revEntries = [...revByPersona.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  const revMax = Math.max(1, ...revEntries.map(([, v]) => v));
  const revenueByPersona: BreakdownRow[] = revEntries.map(([label, v], i) => ({
    label,
    count: v,
    width: Math.round((v / revMax) * 100),
    dot: PERSONA_DOTS[i % PERSONA_DOTS.length],
    valueLabel: money(v),
  }));

  // Leads by source (current window).
  const bySource = new Map<string, number>();
  for (const l of leads) {
    if (bucket(l.created_at).period !== "cur") continue;
    const label = (l.source || "Unknown").trim() || "Unknown";
    bySource.set(label, (bySource.get(label) ?? 0) + 1);
  }
  const srcEntries = [...bySource.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  const srcMax = Math.max(1, ...srcEntries.map(([, v]) => v));
  const leadsBySource: BreakdownRow[] = srcEntries.map(([label, v], i) => ({
    label,
    count: v,
    width: Math.round((v / srcMax) * 100),
    dot: PERSONA_DOTS[i % PERSONA_DOTS.length],
  }));

  // Arc's read — narrative from the real deltas.
  const topPersona = revenueByPersona[0]?.label ?? "your core personas";
  const topSource = leadsBySource[0]?.label ?? "your channels";
  const arcRead = hasHistory
    ? {
        text:
          revDelta.dir === "up" && leadsDelta.dir !== "up"
            ? `Won revenue is up ${revDelta.deltaLabel} while lead volume held roughly flat — you're converting better, not just sourcing more. Revenue is concentrated in the ${topPersona} persona, and ${topSource} is your top lead source.`
            : `You closed ${money(curRev)} across ${curWon} won jobs from ${curLeads} leads this period. Revenue leans on the ${topPersona} persona; ${topSource} brought the most leads. Reply and cost metrics fill in once campaigns send and an ad platform syncs.`,
        cites: [`leads ${curLeads}`, `won ${curWon}`, `rev ${money(curRev)}`],
        rec: `Double down on ${topPersona} — it's your highest-revenue persona this period. Arc can draft a lookalike campaign against it, approval-gated.`,
      }
    : {
        text: "Not enough history yet to trend. As leads, jobs, and outcomes accrue, the funnel and period-over-period deltas build out here.",
        cites: [],
        rec: "",
      };

  const trendLabels = Array.from({ length: WINDOW }, (_, i) => {
    const d = new Date(curStart + i * DAY);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  });

  return { kpis, trend, trendLabels, funnel, revenueByPersona, leadsBySource, arcRead, hasHistory };
}
