import Link from "next/link";

import { EmptyState, PageHeader, StatusPill } from "@/app/_components/page-header";
import { MetricStrip, WorkspacePanel } from "@/app/_components/workspace";
import type { LiveCampaignWorkspace } from "@/lib/campaigns/read-model";
import { LOCKED_CLAIMS, MEASUREMENT_PLAN } from "@/lib/performance/measurement-copy";

import { buildChannelBreakdown, buildComposition, buildFunnel } from "./campaign-analytics-model";

export function CampaignAnalyticsDetail({ detail }: { detail: LiveCampaignWorkspace }) {
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

      <WorkspacePanel
        eyebrow="Package composition"
        title="What this campaign is made of"
        description="The real records attached to this campaign right now."
      >
        <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-4">
          {composition.map((row) => (
            <div key={row.label} className="rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-inset)] p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">{row.label}</div>
              <div className="mt-2 font-display text-2xl font-bold tabular-nums tracking-[-0.04em] text-[var(--text-primary)]">{row.value}</div>
            </div>
          ))}
        </div>
      </WorkspacePanel>

      <WorkspacePanel
        eyebrow="Channels"
        title="Deliverables by channel"
        description="Where this campaign's pieces are headed once approved."
      >
        {channels.length > 0 ? (
          <div className="divide-y divide-[var(--border-hairline)]">
            {channels.map((row) => (
              <div key={row.channel} className="flex items-center justify-between gap-3 px-5 py-3">
                <span className="font-bold text-[var(--text-primary)]">{row.channel}</span>
                <span className="font-mono text-sm font-bold text-[var(--accent)]">{row.count} {row.count === 1 ? "piece" : "pieces"}</span>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState title="No deliverables yet" detail="Once Mark drafts pieces for this campaign, their channels appear here." />
        )}
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
