import Link from "next/link";

import { EmptyState, PageHeader, StatusPill } from "@/app/_components/page-header";
import { MetricStrip, WorkspacePanel } from "@/app/_components/workspace";
import type { LiveCampaignWorkspace } from "@/lib/campaigns/read-model";
import { type CampaignPerformance } from "@/lib/performance/campaign-performance";
import { LOCKED_CLAIMS, MEASUREMENT_PLAN } from "@/lib/performance/measurement-copy";

import { buildChannelBreakdown, buildComposition, buildFunnel, type ChartPoint } from "./campaign-analytics-model";
import { BarBreakdown } from "./charts/bar-breakdown";
import { DonutSplit, type DonutSegment } from "./charts/donut-split";

export function CampaignAnalyticsDetail({ detail, performance }: { detail: LiveCampaignWorkspace; performance: CampaignPerformance }) {
  const { campaign, launchState, assets, metrics } = detail;
  const funnel = buildFunnel(campaign.rollup);
  const channels = buildChannelBreakdown(assets);
  const composition = buildComposition(metrics);

  return (
    <div className="space-y-5">
      <PageHeader
        title={campaign.name}
        description={`How "${campaign.name}" is progressing toward approval, and what still needs backend data before live performance can be measured.`}
        backHref="/analytics"
        backLabel="analytics"
        aside={
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill tone="blue">{campaign.persona}</StatusPill>
            <StatusPill tone="amber">{launchState.lifecycle}</StatusPill>
            <span className="font-mono text-xs text-[var(--text-muted)]">updated {campaign.updatedAt}</span>
          </div>
        }
      />

      <MetricStrip
        metrics={[
          { label: "Approved", value: funnel.approved, detail: "Pieces signed off.", tone: funnel.approved > 0 ? "green" : "gray" },
          { label: "Waiting on you", value: funnel.pending, detail: "Pieces awaiting approval.", tone: funnel.pending > 0 ? "amber" : "gray" },
          { label: "Needs changes", value: funnel.changes, detail: "Pieces sent back for revision.", tone: funnel.changes > 0 ? "red" : "gray" },
          { label: "Ready", value: `${funnel.readiness}%`, detail: `${funnel.approved} of ${funnel.total} pieces approved.`, tone: funnel.readiness === 100 && funnel.total > 0 ? "green" : "blue" },
        ]}
      />

      <WorkspacePanel eyebrow="Readiness" title="Where this campaign stands" description="Every piece in this package by approval state.">
        <div className="grid gap-6 p-5 md:grid-cols-[220px_minmax(0,1fr)] md:items-center">
          <DonutSplit
            segments={[
              { key: "approved", label: "Approved", value: funnel.approved, toneVar: "ok" },
              { key: "pending", label: "Waiting", value: funnel.pending, toneVar: "warn" },
              { key: "changes", label: "Needs changes", value: funnel.changes, toneVar: "priority" },
              // Draft = pieces not yet in any reviewed state (the remainder). AnalyticsFunnel omits draft, so derive it.
              { key: "draft", label: "In draft", value: Math.max(funnel.total - funnel.approved - funnel.pending - funnel.changes, 0), toneVar: "muted" },
            ] satisfies DonutSegment[]}
            centerValue={`${funnel.readiness}%`}
            centerLabel={funnel.total > 0 ? "approved" : "nothing drafted yet"}
          />
          <BarBreakdown
            points={composition.map((row): ChartPoint => ({ label: row.label, value: row.value, tone: "blue" }))}
            emptyTitle="Nothing attached yet"
            emptyDetail="Once Arc drafts pieces, the package composition appears here."
          />
        </div>
      </WorkspacePanel>

      <WorkspacePanel
        eyebrow="Money"
        title="Linked revenue"
        description="Revenue and margin from outcomes linked to this campaign's lead and company, plus estimated pipeline from its jobs. Attribution is approximate — it follows the campaign's linked lead, not a full multi-touch model."
      >
        {performance.status === "live" && performance.money.hasData ? (
          <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Realized revenue" value={formatUsd(performance.money.realizedRevenueCents)} />
            <StatCard label="Margin" value={formatUsd(performance.money.marginCents)} />
            <StatCard label="Won outcomes" value={`${performance.money.wonCount} of ${performance.money.outcomeCount}`} />
            <StatCard label="Estimated pipeline" value={formatUsd(performance.money.estimatedPipelineCents)} />
          </div>
        ) : (
          <EmptyState
            title="No revenue linked yet"
            detail="Once this campaign's lead or company has booked jobs or won outcomes, the linked revenue and margin show here."
          />
        )}
      </WorkspacePanel>

      <WorkspacePanel
        eyebrow="Traffic"
        title="Engagement events"
        description="First-party clicks, form submits, and photo uploads attributed to this campaign — not ad impressions or page views."
      >
        {performance.status === "live" && performance.trafficTracked && performance.traffic.hasData ? (
          <div className="grid gap-5 p-4 xl:grid-cols-2">
            <div>
              <div className="text-xs font-medium text-[var(--text-muted)]">Total events</div>
              <div className="mt-2 font-display text-3xl font-bold tabular-nums tracking-[-0.04em] text-[var(--text-primary)]">
                {performance.traffic.totalEvents}
              </div>
              <div className="mt-4">
                <TrafficList title="By type" rows={performance.traffic.byType} />
              </div>
            </div>
            <TrafficList title="By channel" rows={performance.traffic.byChannel} />
          </div>
        ) : (
          <EmptyState
            title={performance.status === "live" && !performance.trafficTracked ? "Engagement isn't tracked yet" : "No engagement events for this campaign yet"}
            detail={
              performance.status === "live" && !performance.trafficTracked
                ? "The engagement events source isn't available, so clicks, form submits, and photo uploads can't be counted yet."
                : "When someone clicks, submits a form, or uploads photos tied to this campaign, those events appear here."
            }
          />
        )}
      </WorkspacePanel>

      <WorkspacePanel
        eyebrow="Channels"
        title="Deliverables by channel"
        description="Where this campaign's pieces are headed once approved."
      >
        <BarBreakdown
          points={channels.map((row): ChartPoint => ({ label: row.channel, value: row.count, tone: "blue" }))}
          emptyTitle="No deliverables yet"
          emptyDetail="Once Arc drafts pieces for this campaign, their channels appear here."
        />
      </WorkspacePanel>

      <WorkspacePanel
        eyebrow="Performance — needs data"
        title="What we'll measure once this campaign is live"
        description="There's no live delivery or outcome data yet. These are the checkpoints that become real numbers once approved sending and outcome tracking are connected."
        aside={<StatusPill tone="amber">Outbound locked</StatusPill>}
      >
        <div className="divide-y divide-[var(--border-hairline)]">
          {MEASUREMENT_PLAN.map((item) => (
            <div key={item.area} className="px-5 py-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-bold text-[var(--text-primary)]">{item.area}</span>
                <StatusPill tone="amber">{item.currentSignal}</StatusPill>
              </div>
              <p className="mt-1.5 text-sm font-semibold leading-6 text-[var(--text-primary)]">{item.question}</p>
              <p className="mt-1 max-w-[80ch] text-sm leading-6 text-[var(--text-secondary)]">{item.nextStep}</p>
            </div>
          ))}
        </div>
      </WorkspacePanel>

      <WorkspacePanel
        eyebrow="Not claimable yet"
        title="Locked until real outcome data exists"
        description="These stay unavailable so nothing here can imply results the data doesn't support."
      >
        <ul className="divide-y divide-[var(--border-hairline)]">
          {LOCKED_CLAIMS.map((claim) => (
            <li key={claim.title} className="px-5 py-3">
              <div className="font-bold text-[var(--text-primary)]">{claim.title}</div>
              <p className="mt-0.5 max-w-[80ch] text-sm leading-6 text-[var(--text-secondary)]">{claim.detail}</p>
            </li>
          ))}
        </ul>
      </WorkspacePanel>

      <p className="text-sm leading-6 text-[var(--text-secondary)]">
        Want to act on this campaign?{" "}
        <Link className="font-semibold text-[var(--accent)] underline-offset-2 hover:underline" href={`/campaigns/${campaign.id}`}>
          Open it in the campaign workspace
        </Link>
        .
      </p>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-inset)] p-4">
      <div className="text-xs font-medium text-[var(--text-muted)]">{label}</div>
      <div className="mt-2 font-display text-2xl font-bold tabular-nums tracking-[-0.04em] text-[var(--text-primary)]">{value}</div>
    </div>
  );
}

function TrafficList({ title, rows }: { title: string; rows: Array<{ label: string; count: number }> }) {
  return (
    <div>
      <div className="text-xs font-medium text-[var(--text-muted)]">{title}</div>
      <div className="mt-2 divide-y divide-[var(--border-hairline)] overflow-hidden rounded-xl border border-[var(--border-hairline)]">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center justify-between gap-3 px-4 py-2.5">
            <span className="font-semibold text-[var(--text-primary)]">{row.label}</span>
            <span className="font-mono text-sm font-bold text-[var(--accent)]">{row.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Local USD formatter (mirrors formatMoney in the performance read-model; kept
 *  local so that module needn't export it). */
function formatUsd(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(cents / 100);
}
