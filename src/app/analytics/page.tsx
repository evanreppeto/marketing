import { connection } from "next/server";
import Link from "next/link";

import { EmptyState, PageHeader } from "../_components/page-header";
import { WorkspacePanel } from "../_components/workspace";
import { buildPortfolioSplit } from "./_components/campaign-analytics-model";
import { DonutSplit, type DonutSegment } from "./_components/charts/donut-split";
import { SegmentedBar } from "./_components/charts/segmented-bar";
import { getCampaignWorkspaceList, type CampaignWorkspaceListItem } from "@/lib/campaigns/read-model";
import { getPerformanceReadModel } from "@/lib/performance/read-model";
import { getAppSettings } from "@/lib/settings/store";
import { buildTakeaway } from "@/lib/performance/overview-shape";
import { KpiBand, type Kpi } from "./_components/overview/kpi-band";
import { TrendChart } from "./_components/overview/trend-chart";
import { TakeawayBanner } from "./_components/overview/takeaway-banner";
import { SectionNav } from "./_components/overview/section-nav";
import { ConversionTab, ContractTab, LeadVolumeTab, PartnerSignalsTab, RevenueTab } from "./_components/performance-breakdowns";

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

  const [list, performance, settings] = await Promise.all([
    getCampaignWorkspaceList(),
    getPerformanceReadModel(undefined, activeRange.v),
    getAppSettings(),
  ]);
  const brand = { workspaceName: settings.workspaceName, logoUrl: settings.brandLogoUrl };

  if (list.status === "unavailable") {
    return (
      <>
        <AnalyticsHeader brand={brand} />
        <EmptyState
          title="No campaign data to show yet"
          detail="Once campaigns are connected, this page will show how each one is doing and what is waiting on you."
        />
      </>
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
  const kpis: Kpi[] = [
    { label: "Waiting on you", value: String(waitingOnYou), caption: waitingOnYou > 0 ? "need approval" : "all clear", toneVar: "warn", href: waitingOnYou > 0 ? "/campaigns" : undefined },
    { label: "Approved & ready", value: String(readyCount), caption: "signed off", toneVar: "ok" },
    { label: `Leads (${activeRange.short})`, value: perf ? String(perf.leadsRecent.count) : "—", delta: perf ? perf.leadsRecent.delta : null, toneVar: "accent" },
    { label: `Revenue linked (${activeRange.short})`, value: perf ? fmtMoney(perf.revenueRecent.cents) : "—", delta: perf ? perf.revenueRecent.delta : null, toneVar: "accent" },
  ];
  const takeaway = buildTakeaway(split, waitingOnYou);
  // Only link to detail sections that actually render — they exist only when performance is live.
  const sectionLinks = [
    { id: "overview", label: "Overview" },
    ...(perf
      ? [
          { id: "leads", label: "Leads" },
          { id: "conversion", label: "Conversion" },
          { id: "revenue", label: "Revenue" },
          { id: "partners", label: "Partners" },
        ]
      : []),
  ];

  return (
    <>
      <AnalyticsHeader brand={brand} />
      <SectionNav links={sectionLinks} />

      <div className="mb-5 flex items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">Range</span>
        <div className="inline-flex overflow-hidden rounded-lg border border-[var(--border-panel)]">
          {RANGES.map((r) => (
            <Link
              key={r.v}
              href={`/analytics?range=${r.v}`}
              className={`px-3 py-1 text-xs font-semibold transition ${activeRange.v === r.v ? "bg-[var(--accent-soft)] text-[var(--accent)]" : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"}`}
            >
              {r.label}
            </Link>
          ))}
        </div>
      </div>

      <section id="overview" aria-label="Overview" className="scroll-mt-20">
        <KpiBand kpis={kpis} />
        <TakeawayBanner text={takeaway} />
        <div className="mb-5 grid gap-5 xl:grid-cols-[1.5fr_1fr]">
          <WorkspacePanel eyebrow="Trend" title="Leads & booked work" description="New leads vs. booked jobs over the selected range.">
            {perf ? <TrendChart data={perf.trend} /> : <EmptyState title="Trend unavailable" detail={performance.status === "unavailable" ? performance.message : "No data yet."} />}
          </WorkspacePanel>
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
        </div>
        <WorkspacePanel title="Compare your campaigns" description="Each campaign and how far it has moved from draft to approved. Select one to see its full analytics.">
          {rows.length > 0 ? (
            <ul className="divide-y divide-[var(--border-hairline)]">
              {rows.map((row) => (<ComparisonRow key={row.id} row={row} />))}
            </ul>
          ) : (
            <EmptyState title="No campaigns yet" detail="When Mark drafts a campaign or you create one, it will appear here with its progress." />
          )}
        </WorkspacePanel>
      </section>

      {perf ? (
        <>
          <section id="leads" aria-label="Leads" className="mt-8 scroll-mt-20"><SectionHeading title="Leads" /><LeadVolumeTab performance={perf} /></section>
          <section id="conversion" aria-label="Conversion" className="mt-8 scroll-mt-20"><SectionHeading title="Conversion" /><ConversionTab performance={perf} /></section>
          <section id="revenue" aria-label="Revenue" className="mt-8 scroll-mt-20"><SectionHeading title="Revenue" /><RevenueTab performance={perf} /></section>
          <section id="partners" aria-label="Partners" className="mt-8 scroll-mt-20"><SectionHeading title="Partners" /><PartnerSignalsTab rows={perf.partnerSignals} /></section>
          <details className="mt-8 rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-soft)] p-4">
            <summary className="cursor-pointer text-sm font-semibold text-[var(--text-secondary)]">What we can&apos;t measure yet</summary>
            <p className="mt-2 max-w-[70ch] text-sm leading-6 text-[var(--text-muted)]">The fields below are the backend data still needed before deeper performance numbers are trustworthy.</p>
            <div className="mt-3"><ContractTab contracts={perf.contracts} /></div>
          </details>
        </>
      ) : (
        <EmptyState title="Performance data unavailable" detail={performance.status === "unavailable" ? performance.message : "No data yet."} />
      )}
    </>
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

function ComparisonRow({ row }: { row: ComparisonRowData }) {
  return (
    <li>
      <Link
        className="grid gap-4 px-5 py-4 transition hover:bg-[var(--surface-inset)] sm:grid-cols-[minmax(0,1fr)_200px_150px] sm:items-center"
        href={`/analytics/${row.id}`}
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate font-semibold text-[var(--text-primary)]">{row.name}</span>
            <StateBadge row={row} />
          </div>
          <div className="mt-1 text-sm text-[var(--text-secondary)]">
            {row.persona} &middot; {row.assetCount} {row.assetCount === 1 ? "asset" : "assets"} &middot; updated {row.updatedAt}
          </div>
        </div>

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
            {row.total > 0 ? `${row.approved} of ${row.total} pieces approved` : "No pieces drafted yet"}
          </div>
        </div>

        <div className="font-display text-2xl font-bold tabular-nums tracking-[-0.04em] text-[var(--text-primary)] sm:text-right">
          {row.readiness}%
        </div>
      </Link>
    </li>
  );
}

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
    <span className={`shrink-0 rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] ${config.className}`}>
      {config.label}
    </span>
  );
}

function AnalyticsHeader({ brand }: { brand: { workspaceName: string; logoUrl: string } }) {
  return (
    <div className="mb-5">
      <PageHeader
        title="Analytics"
        description="A simple read on your campaigns and what is waiting on you."
        aside={
          <div className="flex items-center gap-2 px-1.5 py-0.5">
            {brand.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- user-configured logo may be external or a data URL.
              <img alt="" className="h-5 w-5 shrink-0 rounded object-contain" src={brand.logoUrl} />
            ) : null}
            <span className="truncate text-sm font-semibold tracking-[-0.01em] text-[var(--text-primary)]">{brand.workspaceName}</span>
          </div>
        }
      />
    </div>
  );
}

function SectionHeading({ title }: { title: string }) {
  return <h2 className="mb-3 font-display text-lg font-bold tracking-[-0.02em] text-[var(--text-primary)]">{title}</h2>;
}
