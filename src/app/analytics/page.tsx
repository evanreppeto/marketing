import { connection } from "next/server";
import Link from "next/link";

import { EmptyState } from "../_components/page-header";
import { WorkspacePanel } from "../_components/workspace";
import { DataTable, type Column } from "../_components/data-table";
import { theme } from "../_components/theme";
import { DossierPanel, WorkbenchFrame } from "../_components/workbench";
import { buildPortfolioSplit } from "./_components/campaign-analytics-model";
import { DonutSplit, type DonutSegment } from "./_components/charts/donut-split";
import { SegmentedBar } from "./_components/charts/segmented-bar";
import { getCampaignWorkspaceList, type CampaignWorkspaceListItem } from "@/lib/campaigns/read-model";
import { getPerformanceReadModel } from "@/lib/performance/read-model";
import { getAppSettings } from "@/lib/settings/store";
import { resolveBrandIdentity } from "@/lib/brand-kit/identity";
import { buildTakeaway } from "@/lib/performance/overview-shape";
import { KpiBand, type Kpi } from "./_components/overview/kpi-band";
import { TrendChart } from "./_components/overview/trend-chart";
import { TakeawayBanner } from "./_components/overview/takeaway-banner";
import { InsightsRail } from "./_components/overview/insights-rail";
import { CampaignPerformanceTable } from "./_components/overview/campaign-performance-table";
import { FunnelFlow } from "./_components/charts/funnel-flow";
import { ChannelBars } from "./_components/overview/channel-bars";
import { AnalyticsExplorer } from "./_components/overview/analytics-explorer";
import { StatStrip, type StatItem } from "../_components/page-header";
import { ConversionTab, ContractTab, LeadVolumeTab, PartnerSignalsTab, RevenueTab } from "./_components/performance-breakdowns";
import { getCurrentOrgId } from "@/lib/auth/org";
import { isSupabaseAdminConfigured } from "@/lib/supabase/server";

export const metadata = {
  title: "Analytics",
};

/** Dot color for a readiness-legend segment, keyed by tone so a new tone has one obvious home. */
const SEGMENT_DOT: Record<DonutSegment["toneVar"], string> = {
  ok: "bg-[var(--ok)]",
  warn: "bg-[var(--warn)]",
  priority: "bg-[var(--priority)]",
  muted: "bg-[var(--border-strong)]",
};

export default async function AnalyticsPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  await connection();

  const params = searchParams ? await searchParams : {};
  const rawRange = Array.isArray(params.range) ? params.range[0] : params.range;
  const RANGES = [
    { v: 30, label: "30 days", short: "30d" },
    { v: 90, label: "90 days", short: "90d" },
    { v: 365, label: "1 year", short: "1y" },
  ] as const;
  const activeRange = RANGES.find((r) => String(r.v) === rawRange) ?? RANGES[0];
  const orgId = isSupabaseAdminConfigured() ? await getCurrentOrgId().catch(() => undefined) : undefined;

  const [list, performance, settings, identity] = await Promise.all([
    getCampaignWorkspaceList(undefined, "Arc", orgId),
    getPerformanceReadModel(undefined, activeRange.v),
    getAppSettings(),
    resolveBrandIdentity(),
  ]);
  const brand = { workspaceName: identity.displayName ?? settings.workspaceName, logoUrl: identity.logoUrl ?? settings.brandLogoUrl };

  if (list.status === "unavailable") {
    return (
      <WorkbenchFrame
        actions={<AnalyticsBrandBadge brand={brand} />}
        description="Source-backed performance reporting for leads, booked work, revenue, approvals, and next actions."
        eyebrow="Executive reporting"
        title="Analytics"
      >
        <EmptyState
          title="No campaign data to show yet"
          detail="Once campaigns are connected, this page will show how each one is doing and what is waiting on you."
        />
      </WorkbenchFrame>
    );
  }

  const campaigns = list.campaigns;
  const rows = campaigns.map(toComparisonRow).sort(byMostNeedingAttention);

  const readyCount = rows.filter((row) => row.state === "ready").length;
  const waitingOnYou = rows.reduce((total, row) => total + row.pending, 0);

  const split = buildPortfolioSplit(campaigns);
  const heroSegments: DonutSegment[] = [
    { key: "approved", label: "Approved", value: split.approved, toneVar: "ok" },
    { key: "pending", label: "Waiting on you", value: split.pending, toneVar: "warn" },
    { key: "changes", label: "Needs changes", value: split.changes, toneVar: "priority" },
    { key: "draft", label: "In draft", value: split.draft, toneVar: "muted" },
  ];

  const perf = performance.status === "live" ? performance : null;
  const fmtMoney = (cents: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(cents / 100);
  const takeaway = buildTakeaway(split, waitingOnYou);

  // Prefer the rich KPI strip (sparklines + deltas) when the performance model carries it;
  // otherwise fall back to the approval-readiness KpiBand so older/live data still renders.
  const statItems: StatItem[] | null = perf?.kpis
    ? perf.kpis.map((k) => ({ label: k.label, value: k.value, hint: k.hint, delta: k.delta, deltaTone: k.deltaTone, tone: k.tone, spark: k.spark }))
    : null;
  const fallbackKpis: Kpi[] = [
    { label: "Waiting on you", value: String(waitingOnYou), caption: waitingOnYou > 0 ? "need approval" : "all clear", toneVar: "warn", href: waitingOnYou > 0 ? "/campaigns" : undefined },
    { label: "Approved & ready", value: String(readyCount), caption: "signed off", toneVar: "ok" },
    { label: `Leads (${activeRange.short})`, value: perf ? String(perf.leadsRecent.count) : "—", delta: perf ? perf.leadsRecent.delta : null, toneVar: "accent" },
    { label: `Revenue linked (${activeRange.short})`, value: perf ? fmtMoney(perf.revenueRecent.cents) : "—", delta: perf ? perf.revenueRecent.delta : null, toneVar: "accent" },
  ];

  return (
    <WorkbenchFrame
      actions={<AnalyticsBrandBadge brand={brand} demo={Boolean(perf?.isDemo)} />}
      aside={
        <AnalyticsNarrativeDossier
          activeRange={activeRange.label}
          readyCount={readyCount}
          takeaway={takeaway}
          waitingOnYou={waitingOnYou}
        />
      }
      description="Source-backed performance reporting for leads, booked work, revenue, approvals, and next actions."
      eyebrow="Executive reporting"
      tabs={<AnalyticsRangeTabs activeRange={activeRange.v} ranges={RANGES} />}
      title="Analytics"
    >

      {/* General analytics + range filter — the at-a-glance read */}
      {statItems ? <StatStrip items={statItems} /> : <KpiBand kpis={fallbackKpis} />}
      <TakeawayBanner text={takeaway} />

      {/* Performance over time — the hero chart, full width */}
      <WorkspacePanel className="mb-5" eyebrow="Performance over time" title="Leads & booked work" description="New leads vs. booked jobs across the selected range.">
        {perf ? <TrendChart data={perf.trend} /> : <EmptyState title="Trend unavailable" detail={performance.status === "unavailable" ? performance.message : "No data yet."} />}
      </WorkspacePanel>

      {/* Portfolio donut + insights rail sit above the explorer; the explorer
          owns the funnel, channels, and per-campaign table so its filter bar
          can re-derive all three together. */}
      <div className="mb-5 grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <WorkspacePanel eyebrow="Readiness" title="Portfolio approval">
          <div className="grid gap-5 p-5 sm:grid-cols-[180px_minmax(0,1fr)] sm:items-center">
            <DonutSplit segments={heroSegments} centerValue={`${split.readiness}%`} centerLabel={split.total > 0 ? "approved" : "nothing drafted yet"} />
            <dl className="space-y-2 text-sm">
              {heroSegments.map((seg) => (
                <div key={seg.key} className="flex items-center justify-between gap-3">
                  <dt className="flex items-center gap-2 text-[var(--text-secondary)]"><span className={`h-2 w-2 rounded-sm ${SEGMENT_DOT[seg.toneVar]}`} aria-hidden="true" />{seg.label}</dt>
                  <dd className="font-mono text-xs font-bold text-[var(--text-primary)]">{seg.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </WorkspacePanel>
        {perf?.anomalies && perf?.nextMoves ? <InsightsRail anomalies={perf.anomalies} nextMoves={perf.nextMoves} /> : null}
      </div>

      {/* Filterable funnel + channels + per-campaign table (client island). */}
      {perf?.channelPerformance && perf?.campaignRows ? (
        <div className="mb-5">
          <AnalyticsExplorer funnelStages={perf.funnelStages} channels={perf.channelPerformance} campaignRows={perf.campaignRows} />
        </div>
      ) : (
        <>
          {perf ? (
            <WorkspacePanel className="mb-5" eyebrow="Funnel" title="Impressions to booked work" description="How reach narrows into booked jobs.">
              <FunnelFlow stages={perf.funnelStages} />
            </WorkspacePanel>
          ) : null}
          {perf?.channelPerformance ? (
            <WorkspacePanel className="mb-5" eyebrow="Channels" title="Channel performance" description="Leads, booked work, and revenue by channel.">
              <ChannelBars channels={perf.channelPerformance} />
            </WorkspacePanel>
          ) : null}
          {perf?.campaignRows ? (
            <WorkspacePanel className="mb-5" eyebrow="Per campaign" title="Campaign performance" description="Reach, leads, booked work, and revenue per campaign. Select one to open its full analytics.">
              <CampaignPerformanceTable rows={perf.campaignRows} />
            </WorkspacePanel>
          ) : (
            <WorkspacePanel className="mb-5" title="Campaigns" description="Every campaign and its progress. Select one to open its full analytics.">
              <DataTable
                columns={CAMPAIGN_COLUMNS}
                rows={rows}
                rowKey={(row) => row.id}
                rowHref={(row) => `/analytics/${row.id}`}
                minWidth="min-w-[760px]"
                emptyState={<EmptyState title="No campaigns yet" detail="When Arc drafts a campaign or you create one, it will appear here with its progress." />}
              />
            </WorkspacePanel>
          )}
        </>
      )}

      {/* Portfolio-wide breakdowns live here, collapsed, so the main view stays calm. */}
      {perf ? (
        <details className="mt-5">
          <summary className="cursor-pointer select-none rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-soft)] px-5 py-3 text-sm font-semibold text-[var(--text-secondary)] transition-[background-color,border-color,color] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-inset)] hover:text-[var(--text-primary)]">
            More analytics — leads, conversion, revenue &amp; partners
          </summary>
          <div className="mt-5 space-y-8">
            <div><SectionHeading title="Leads" /><LeadVolumeTab performance={perf} /></div>
            <div><SectionHeading title="Conversion" /><ConversionTab performance={perf} /></div>
            <div><SectionHeading title="Revenue" /><RevenueTab performance={perf} /></div>
            <div><SectionHeading title="Partners" /><PartnerSignalsTab rows={perf.partnerSignals} /></div>
            <div><SectionHeading title="What we can't measure yet" /><ContractTab contracts={perf.contracts} /></div>
          </div>
        </details>
      ) : null}
    </WorkbenchFrame>
  );
}

type ComparisonRowData = {
  id: string;
  name: string;
  persona: string;
  updatedAt: string;
  assetCount: number;
  approved: number;
  total: number;
  pending: number;
  changes: number;
  readiness: number;
  state: "ready" | "changes" | "waiting" | "draft";
};

function toComparisonRow(campaign: CampaignWorkspaceListItem): ComparisonRowData {
  const { approved, pending, changes, total } = campaign.rollup;
  const readiness = total > 0 ? Math.round((approved / total) * 100) : 0;

  const state: ComparisonRowData["state"] =
    changes > 0 ? "changes" : pending > 0 ? "waiting" : total > 0 && approved === total ? "ready" : "draft";

  return {
    id: campaign.id,
    name: campaign.name,
    persona: campaign.persona,
    updatedAt: campaign.updatedAt,
    assetCount: campaign.assetCount,
    approved,
    total,
    pending,
    changes,
    readiness,
    state,
  };
}

/** Surface what needs the operator first: changes, then approvals, then the rest by progress. */
function byMostNeedingAttention(a: ComparisonRowData, b: ComparisonRowData) {
  const weight = (row: ComparisonRowData) => (row.state === "changes" ? 3 : row.state === "waiting" ? 2 : 0);
  const diff = weight(b) - weight(a);
  if (diff !== 0) return diff;
  return b.readiness - a.readiness;
}

const CAMPAIGN_COLUMNS: Column<ComparisonRowData>[] = [
  {
    key: "campaign",
    header: "Campaign",
    cell: (row) => (
      <div className="min-w-0">
        <div className="truncate font-semibold text-[var(--text-primary)]">{row.name}</div>
        <div className="mt-0.5 text-xs text-[var(--text-secondary)]">
          {row.persona} &middot; {row.assetCount} {row.assetCount === 1 ? "asset" : "assets"} &middot; updated {row.updatedAt}
        </div>
      </div>
    ),
  },
  {
    key: "status",
    header: "Status",
    width: "w-[180px]",
    cell: (row) => <StateBadge row={row} />,
  },
  {
    key: "progress",
    header: "Progress",
    width: "w-[220px]",
    cell: (row) => (
      <div className="min-w-0">
        <SegmentedBar
          segments={[
            { key: "approved", value: row.approved, toneVar: "ok" },
            { key: "pending", value: row.pending, toneVar: "warn" },
            { key: "changes", value: row.changes, toneVar: "priority" },
            { key: "draft", value: Math.max(row.total - row.approved - row.pending - row.changes, 0), toneVar: "idle" },
          ]}
        />
        <div className="mt-1.5 text-xs font-medium text-[var(--text-muted)]">
          {row.total > 0 ? `${row.approved} of ${row.total} approved` : "No pieces yet"}
        </div>
      </div>
    ),
  },
  {
    key: "readiness",
    header: "Approved",
    align: "right",
    width: "w-[96px]",
    cell: (row) => (
      <span className="font-display text-lg font-bold tabular-nums tracking-[-0.03em] text-[var(--text-primary)]">{row.readiness}%</span>
    ),
  },
];

function StateBadge({ row }: { row: ComparisonRowData }) {
  const config =
    row.state === "changes"
      ? {
          label: `${row.changes} need ${row.changes === 1 ? "a change" : "changes"}`,
          className: "border-[oklch(0.68_0.2_26/0.4)] bg-[oklch(0.68_0.2_26/0.13)] text-[oklch(0.86_0.09_26)]",
        }
      : row.state === "waiting"
        ? {
            label: `${row.pending} waiting for approval`,
            className: "border-[oklch(0.82_0.13_85/0.36)] bg-[oklch(0.82_0.13_85/0.12)] text-[oklch(0.9_0.09_85)]",
          }
        : row.state === "ready"
          ? {
              label: "Ready",
              className: "border-[oklch(0.78_0.14_158/0.36)] bg-[oklch(0.78_0.14_158/0.12)] text-[oklch(0.88_0.1_158)]",
            }
          : {
              label: "In draft",
              className: "border-[var(--border-hairline)] bg-[var(--surface-soft)] text-[var(--text-muted)]",
            };

  return (
    <span className={`inline-block shrink-0 rounded-md border px-2 py-0.5 text-[10px] font-medium ${config.className}`}>
      {config.label}
    </span>
  );
}

function AnalyticsRangeTabs({
  activeRange,
  ranges,
}: {
  activeRange: number;
  ranges: ReadonlyArray<{ v: number; label: string; short: string }>;
}) {
  return (
    <nav aria-label="Analytics range" className={theme.control.tabList}>
      {ranges.map((range) => {
        const active = activeRange === range.v;
        return (
          <Link
            aria-current={active ? "true" : undefined}
            className={`relative min-h-10 shrink-0 rounded-[8px] px-3 py-2 text-sm font-semibold transition duration-150 active:translate-y-px ${
              active
                ? "text-[var(--text-primary)]"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            }`}
            href={`/analytics?range=${range.v}`}
            key={range.v}
          >
            {range.label}
            {active ? <span aria-hidden className={theme.control.tabMarker} /> : null}
          </Link>
        );
      })}
    </nav>
  );
}

function AnalyticsBrandBadge({
  brand,
  demo = false,
}: {
  brand: { workspaceName: string; logoUrl: string | null | undefined };
  demo?: boolean;
}) {
  return (
    <div className="flex items-center gap-2 rounded-[8px] border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-3 py-2">
      {demo ? (
        <span className="rounded-[4px] border border-[var(--warn-border-soft)] bg-[var(--warn-soft)] px-2 py-0.5 text-[10px] font-medium text-[var(--warn-text)]">
          Demo data
        </span>
      ) : null}
      {brand.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- user-configured logo may be external or a data URL.
        <img alt="" className="h-5 w-5 shrink-0 rounded object-contain" src={brand.logoUrl} />
      ) : null}
      <span className="max-w-[14rem] truncate text-sm font-semibold tracking-[-0.01em] text-[var(--text-primary)]">{brand.workspaceName}</span>
    </div>
  );
}

function AnalyticsNarrativeDossier({
  activeRange,
  readyCount,
  takeaway,
  waitingOnYou,
}: {
  activeRange: string;
  readyCount: number;
  takeaway: string;
  waitingOnYou: number;
}) {
  return (
    <DossierPanel title="Arc narrative">
      <div className="space-y-4">
        <div>
          <div className="signal-eyebrow">Range</div>
          <p className="mt-2 text-sm font-semibold text-[var(--text-primary)]">{activeRange}</p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <DossierStat label="Waiting" value={waitingOnYou} tone={waitingOnYou > 0 ? "accent" : "ok"} />
          <DossierStat label="Ready" value={readyCount} tone={readyCount > 0 ? "ok" : "neutral"} />
        </div>
        <div className="rounded-[8px] border border-[var(--border-hairline)] bg-[var(--surface-inset)] p-3">
          <div className="signal-eyebrow">Takeaway</div>
          <p className="mt-2 text-sm font-semibold leading-6 text-[var(--text-primary)]">{takeaway}</p>
        </div>
        <div className="rounded-[8px] border border-[var(--accent-border)] bg-[var(--accent-soft)] p-3">
          <div className="signal-eyebrow text-[var(--accent-contrast)]">Recommended action</div>
          <p className="mt-2 text-sm font-semibold leading-6 text-[var(--text-primary)]">
            Resolve approval waits before reading trend movement as campaign performance.
          </p>
        </div>
      </div>
    </DossierPanel>
  );
}

function DossierStat({
  label,
  tone = "neutral",
  value,
}: {
  label: string;
  tone?: "neutral" | "accent" | "ok";
  value: React.ReactNode;
}) {
  const valueClass = tone === "ok" ? "text-[var(--ok-text)]" : tone === "accent" ? "text-[var(--accent-contrast)]" : "text-[var(--text-primary)]";
  return (
    <div className="rounded-[8px] border border-[var(--border-hairline)] bg-[var(--surface-soft)] px-3 py-2">
      <div className={`font-display text-xl font-semibold tabular-nums ${valueClass}`}>{value}</div>
      <div className="mt-0.5 text-[10px] font-medium text-[var(--text-muted)]">{label}</div>
    </div>
  );
}

function SectionHeading({ title }: { title: string }) {
  return <h2 className="mb-3 font-display text-lg font-bold tracking-[-0.02em] text-[var(--text-primary)]">{title}</h2>;
}
