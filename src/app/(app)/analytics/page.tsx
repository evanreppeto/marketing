import { getCrmMentionSamples, getCrmNavCounts, type CrmObjectRow } from "@/lib/crm/read-model";
import { getRecentActivity, type ActivityEntry, type ActivityTone } from "@/lib/activity/read-model";
import { getCurrentWorkspaceContext } from "@/lib/auth/workspace";

import {
  AnalyticsView,
  type ActivityDayVM,
  type AnalyticsData,
  type BreakdownRow,
  type FunnelStage,
} from "./_components/analytics-view";

export const metadata = { title: "Analytics — Arc" };

const PERSONA_DOTS = ["#7fb89a", "#c8a24a", "#88b6d8", "#9678c8", "#cc6a6a", "#d8a24a"];

const TONE_DOT: Record<ActivityTone, string> = {
  green: "var(--ok)",
  red: "var(--red)",
  amber: "var(--warn)",
  blue: "#88b6d8",
  gray: "var(--muted)",
};

function humanizePersona(persona: string): string {
  const s = (persona || "").replace(/^persona[\s_-]+/i, "").replace(/[_-]+/g, " ").trim();
  if (!s || /^unassigned/i.test(s)) return "Unassigned";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function timeLabel(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  const today = new Date().toDateString() === d.toDateString();
  return today
    ? d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
    : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function toActivityRow(e: ActivityEntry) {
  const meta = [e.actor, e.relatedLabel, e.insightLabel].filter(Boolean) as string[];
  return { id: e.id, dot: TONE_DOT[e.tone] ?? "var(--muted)", title: e.title, detail: e.detail, meta, time: timeLabel(e.occurredAt) };
}

export default async function AnalyticsPage() {
  const ctx = await getCurrentWorkspaceContext();
  const [navCounts, samples, activity] = await Promise.all([
    getCrmNavCounts().catch(() => ({ status: "unavailable" }) as const),
    getCrmMentionSamples().catch(() => ({}) as Partial<Record<string, CrmObjectRow[]>>),
    getRecentActivity({}, undefined, ctx.orgId).catch(() => ({ status: "unavailable" }) as const),
  ]);

  const counts = navCounts.status === "live" ? navCounts.counts : { companies: 0, contacts: 0, properties: 0, leads: 0, jobs: 0, outcomes: 0 };

  // KPIs — CRM counts are real; send/spend metrics honestly flagged as needing data.
  const kpis = [
    { label: "Leads", value: counts.leads.toLocaleString(), sub: "in CRM", wired: true },
    { label: "Companies", value: counts.companies.toLocaleString(), sub: "tracked", wired: true },
    { label: "Booked jobs", value: counts.jobs.toLocaleString(), sub: counts.jobs === 0 ? "none scheduled yet" : "scheduled", wired: true },
    { label: "Won revenue", value: "$0", sub: "needs outcome data", wired: false },
    { label: "Reply rate", value: "—", sub: "needs send data", wired: false },
  ];

  // Lifecycle funnel from CRM counts.
  const funnelRaw = [
    { label: "Companies", count: counts.companies },
    { label: "Contacts", count: counts.contacts },
    { label: "Leads", count: counts.leads },
    { label: "Booked jobs", count: counts.jobs },
    { label: "Won", count: counts.outcomes },
  ];
  const funnelMax = Math.max(1, ...funnelRaw.map((s) => s.count));
  const funnel: FunnelStage[] = funnelRaw.map((s) => ({
    label: s.label,
    count: s.count,
    width: Math.round((s.count / funnelMax) * 100),
    note: funnelMax > 0 ? `${Math.round((s.count / funnelMax) * 100)}%` : "",
  }));

  // Leads by persona.
  const leadRows = samples.leads ?? [];
  const byPersona = new Map<string, number>();
  for (const row of leadRows) {
    const label = humanizePersona(row.personaTag);
    byPersona.set(label, (byPersona.get(label) ?? 0) + 1);
  }
  const bdEntries = [...byPersona.entries()].sort((a, b) => b[1] - a[1]);
  const bdMax = Math.max(1, ...bdEntries.map(([, n]) => n));
  const breakdown: BreakdownRow[] = bdEntries.map(([label, count], i) => ({
    label,
    count,
    width: Math.round((count / bdMax) * 100),
    dot: PERSONA_DOTS[i % PERSONA_DOTS.length],
  }));

  // Arc's honest read of the numbers.
  const topPersona = bdEntries[0]?.[0] ?? "your audience";
  const arcRead =
    counts.leads === 0
      ? "No leads in the pipeline yet. Once Arc discovers and ingests leads, your funnel and conversion analytics build out here."
      : `You're tracking ${counts.leads} lead${counts.leads === 1 ? "" : "s"} across ${counts.companies} compan${counts.companies === 1 ? "y" : "ies"}, concentrated in the ${topPersona} persona. ${counts.jobs === 0 ? "No jobs are booked yet — the fastest lever is moving these leads into inspections." : `${counts.jobs} job${counts.jobs === 1 ? " is" : "s are"} booked.`} Send, reply, and revenue analytics light up as approved campaigns actually send and report results.`;
  const arcCites = [`leads ${counts.leads}`, `companies ${counts.companies}`, `jobs ${counts.jobs}`];

  // Activity feed.
  const activitySummary =
    activity.status === "live"
      ? [
          { label: "Needs review", value: activity.summary.needsReview },
          { label: "Arc actions", value: activity.summary.arcActions },
          { label: "Campaign progress", value: activity.summary.campaignProgress },
          { label: "Blocked / risky", value: activity.summary.blockedOrRisky },
        ]
      : [];
  const activityDays: ActivityDayVM[] =
    activity.status === "live"
      ? activity.groups.map((g) => ({ label: g.label, rows: g.entries.map(toActivityRow) }))
      : [];

  const data: AnalyticsData = { kpis, funnel, breakdown, arcRead, arcCites, activitySummary, activityDays };
  return <AnalyticsView data={data} />;
}
