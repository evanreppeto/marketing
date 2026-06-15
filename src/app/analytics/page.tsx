import { connection } from "next/server";
import Link from "next/link";

import { EmptyState, PageHeader } from "../_components/page-header";
import { TabNav } from "../_components/tab-nav";
import { WorkspacePanel } from "../_components/workspace";
import { buildPortfolioSplit } from "./_components/campaign-analytics-model";
import { DonutSplit, type DonutSegment } from "./_components/charts/donut-split";
import { SegmentedBar } from "./_components/charts/segmented-bar";
import { getCampaignWorkspaceList, type CampaignWorkspaceListItem } from "@/lib/campaigns/read-model";
import { getPerformanceReadModel } from "@/lib/performance/read-model";
import { getAppSettings } from "@/lib/settings/store";

import { ConversionTab, ContractTab, LeadVolumeTab, PartnerSignalsTab, RevenueTab } from "./_components/performance-breakdowns";

export const metadata = {
  title: "Analytics",
};

type AnalyticsTabKey = "campaigns" | "leads" | "conversion" | "revenue" | "partners" | "contract";

const analyticsTabs: Array<{ key: AnalyticsTabKey; label: string; detail: string }> = [
  { key: "campaigns", label: "Campaigns", detail: "Per-campaign progress and insight." },
  { key: "leads", label: "Leads", detail: "Persona and source volume." },
  { key: "conversion", label: "Conversion", detail: "Booking, estimate, and close signals." },
  { key: "revenue", label: "Revenue", detail: "Persona revenue and CTA events." },
  { key: "partners", label: "Partners", detail: "Referral and partner attribution." },
  { key: "contract", label: "Data contract", detail: "Backend fields still needed." },
];

/** Tone-dot color for a hero stat tile, keyed by tone so adding a tone has one obvious home. */
const STAT_DOT_CLASS: Record<"ok" | "warn" | "accent", string> = {
  ok: "bg-[var(--ok)]",
  warn: "bg-[var(--warn)]",
  accent: "bg-[var(--accent)]",
};

function normalizeTab(value: string | string[] | undefined): AnalyticsTabKey {
  const tab = Array.isArray(value) ? value[0] : value;
  return analyticsTabs.some((item) => item.key === tab) ? (tab as AnalyticsTabKey) : "campaigns";
}

export default async function AnalyticsPage({ searchParams }: { searchParams?: Promise<{ tab?: string | string[] }> }) {
  await connection();

  const query = searchParams ? await searchParams : {};
  const activeTab = normalizeTab(query.tab);
  const [list, performance, settings] = await Promise.all([
    getCampaignWorkspaceList(),
    getPerformanceReadModel(),
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
  const heroStats = [
    { label: "Waiting on you", value: waitingOnYou, href: waitingOnYou > 0 ? "/campaigns" : undefined, toneVar: "warn" as const },
    { label: "Approved & ready", value: readyCount, toneVar: "ok" as const },
    { label: "Campaigns", value: list.totals.campaigns, toneVar: "accent" as const },
    { label: "Creative made", value: list.totals.assets, toneVar: "accent" as const },
  ];

  return (
    <>
      <AnalyticsHeader brand={brand} />

      <WorkspacePanel className="mb-5">
        <div className="grid gap-6 p-5 md:grid-cols-[220px_minmax(0,1fr)] md:items-center">
          <DonutSplit
            segments={heroSegments}
            centerValue={`${split.readiness}%`}
            centerLabel={split.total > 0 ? "of your work is approved" : "nothing drafted yet"}
          />
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-[var(--border-hairline)] bg-[var(--border-hairline)]">
            {heroStats.map((stat) => {
              const dot = STAT_DOT_CLASS[stat.toneVar];
              const body = (
                <>
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">
                    <span className={`h-1.5 w-1.5 rounded-full ${dot}`} aria-hidden="true" />
                    {stat.label}
                  </div>
                  <div className="mt-2 font-display text-3xl font-bold tabular-nums tracking-[-0.05em] text-[var(--text-primary)]">{stat.value}</div>
                </>
              );
              return stat.href ? (
                <Link key={stat.label} href={stat.href} className="bg-[var(--surface-panel)] p-4 transition hover:bg-[var(--surface-inset)]">
                  {body}
                </Link>
              ) : (
                <div key={stat.label} className="bg-[var(--surface-panel)] p-4">
                  {body}
                </div>
              );
            })}
          </div>
        </div>
      </WorkspacePanel>

      <TabNav
        ariaLabel="Analytics sections"
        activeKey={activeTab}
        columns="sm:grid-cols-2 xl:grid-cols-6"
        className="mb-5"
        tabs={analyticsTabs.map((tab) => ({
          key: tab.key,
          label: tab.label,
          detail: tab.detail,
          href: `/analytics?tab=${tab.key}`,
        }))}
      />

      {activeTab === "campaigns" ? (
        <WorkspacePanel
          title="Compare your campaigns"
          description="Each campaign and how far it has moved from draft to approved. Select one to see its full analytics."
        >
          {rows.length > 0 ? (
            <ul className="divide-y divide-[var(--border-hairline)]">
              {rows.map((row) => (
                <ComparisonRow key={row.id} row={row} />
              ))}
            </ul>
          ) : (
            <EmptyState
              title="No campaigns yet"
              detail="When Mark drafts a campaign or you create one, it will appear here with its progress."
            />
          )}
        </WorkspacePanel>
      ) : performance.status === "unavailable" ? (
        <EmptyState title="Performance data unavailable" detail={performance.message} />
      ) : activeTab === "leads" ? (
        <LeadVolumeTab performance={performance} />
      ) : activeTab === "conversion" ? (
        <ConversionTab rows={performance.conversionSignals} />
      ) : activeTab === "revenue" ? (
        <RevenueTab performance={performance} />
      ) : activeTab === "partners" ? (
        <PartnerSignalsTab rows={performance.partnerSignals} />
      ) : (
        <ContractTab contracts={performance.contracts} />
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
