"use client";

import { EmptyState, StatusPill } from "@/app/_components/page-header";
import type { LiveCampaignWorkspace } from "@/lib/campaigns/read-model";

import { SectionHeader } from "./section-header";
import { statusTone } from "./status-tone";

export function PerformanceTab({ detail }: { detail: LiveCampaignWorkspace }) {
  const { campaign, metrics, approvals, assets, media, sources } = detail;
  const waitingApprovals = approvals.filter((approval) => !/approved|declined|archived|rejected/i.test(approval.status));
  const approvedApprovals = approvals.filter((approval) => /approved/i.test(approval.status));
  const sourceHealth = sources.length > 0 ? "Evidence linked" : "Needs source records";
  const creativeHealth = assets.length > 0 ? "Creative attached" : "Needs deliverables";

  return (
    <div className="grid gap-5">
      <section className="overflow-hidden rounded-2xl border border-[var(--border-panel)] bg-[var(--surface-panel)] shadow-[var(--elev-panel)]">
        <div className="border-b border-[var(--border-hairline)] bg-[var(--surface-inset)] px-5 py-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="signal-eyebrow">Campaign measurement</span>
            <StatusPill tone="amber">Outbound locked</StatusPill>
            <StatusPill tone={campaign.launchLocked ? "amber" : "blue"}>
              {campaign.launchLocked ? "No launch approval" : "Draft approved"}
            </StatusPill>
          </div>
          <h2 className="mt-3 text-2xl font-black tracking-[-0.04em] text-[var(--text-primary)]">
            What this package can prove right now
          </h2>
          <p className="mt-2 max-w-[76ch] text-sm leading-6 text-[var(--text-secondary)]">
            This tab separates existing campaign evidence from future performance attribution. No ad spend,
            publishing, sending, or optimization action is available from this screen.
          </p>
        </div>

        <div className="grid gap-0 md:grid-cols-2 xl:grid-cols-4">
          <MeasurementCard label="Creative coverage" value={metrics.assets} detail={creativeHealth} tone={metrics.assets > 0 ? "blue" : "gray"} />
          <MeasurementCard label="Media coverage" value={metrics.media} detail={`${media.length} image/video/file signals`} tone={metrics.media > 0 ? "blue" : "gray"} />
          <MeasurementCard label="Evidence coverage" value={metrics.sources} detail={sourceHealth} tone={metrics.sources > 0 ? "blue" : "amber"} />
          <MeasurementCard label="Approval gate" value={waitingApprovals.length} detail={`${approvedApprovals.length} approved records`} tone={waitingApprovals.length > 0 ? "amber" : "green"} />
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="overflow-hidden rounded-2xl border border-[var(--border-panel)] bg-[var(--surface-panel)] shadow-[var(--elev-panel)]">
          <div className="border-b border-[var(--border-hairline)] bg-[var(--surface-inset)] px-5 py-4">
            <SectionHeader tone="blue" eyebrow="Performance fields" detail="Needed before ROI claims." count={PERFORMANCE_CONTRACTS.length} />
          </div>
          <div className="divide-y divide-[var(--border-hairline)]">
            {PERFORMANCE_CONTRACTS.map((contract) => (
              <div className="grid gap-3 px-5 py-4 lg:grid-cols-[180px_minmax(0,1fr)]" key={contract.area}>
                <div>
                  <div className="font-bold text-[var(--text-primary)]">{contract.area}</div>
                  <div className="mt-1 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--accent)]">{contract.currentSignal}</div>
                </div>
                <div className="space-y-2">
                  <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-3 py-2">
                    <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">Missing backend fields</div>
                    <div className="mt-1 font-mono text-xs leading-5 text-[var(--text-secondary)]">{contract.missingFields}</div>
                  </div>
                  <p className="text-sm leading-6 text-[var(--text-secondary)]">{contract.nextStep}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <aside className="space-y-5">
          <section className="rounded-2xl border border-[oklch(0.82_0.13_85/0.36)] bg-[oklch(0.82_0.13_85/0.08)] p-5 shadow-[var(--elev-panel)]">
            <div className="flex flex-wrap items-center gap-2">
              <div className="signal-eyebrow">Human gate</div>
              <StatusPill tone="amber">Locked</StatusPill>
            </div>
            <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">
              Mark can summarize this package and request revisions. Only a human-approved workflow can send,
              publish, launch, spend, or contact any lead or partner.
            </p>
          </section>

          <section className="overflow-hidden rounded-2xl border border-[var(--border-panel)] bg-[var(--surface-panel)] shadow-[var(--elev-panel)]">
            <div className="border-b border-[var(--border-hairline)] bg-[var(--surface-inset)] px-5 py-4">
              <SectionHeader tone="gray" eyebrow="Approval status" detail="Decision records." count={approvals.length} />
            </div>
            {approvals.length > 0 ? (
              <div className="divide-y divide-[var(--border-hairline)]">
                {approvals.slice(0, 5).map((approval) => (
                  <div className="flex items-start justify-between gap-3 px-5 py-3" key={approval.id}>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-bold text-[var(--text-primary)]">{approval.title}</div>
                      <div className="mt-1 text-xs text-[var(--text-muted)]">{approval.type}</div>
                    </div>
                    <StatusPill tone={statusTone(approval.status)}>{approval.status}</StatusPill>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-5">
                <EmptyState
                  title="No approval records yet"
                  detail="Campaign performance cannot move toward execution until the package creates approval items."
                />
              </div>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}

function MeasurementCard({
  detail,
  label,
  tone,
  value,
}: {
  detail: string;
  label: string;
  tone: "amber" | "blue" | "gray" | "green";
  value: number | string;
}) {
  return (
    <div className="border-b border-r border-[var(--border-hairline)] p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">{label}</div>
        <StatusPill tone={tone}>{typeof value === "number" ? value : "Set"}</StatusPill>
      </div>
      <div className="mt-3 font-display text-3xl font-black tracking-[-0.05em] text-[var(--text-primary)]">{value}</div>
      <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">{detail}</p>
    </div>
  );
}

const PERFORMANCE_CONTRACTS = [
  {
    area: "Ad delivery",
    currentSignal: "Campaign package only",
    missingFields: "impressions, clicks, ctr, platform_campaign_id, platform_asset_id",
    nextStep: "Add read-only campaign_results rows after an approved platform integration exists.",
  },
  {
    area: "Spend control",
    currentSignal: "No spend controls enabled",
    missingFields: "spend_cents, budget_cents, spend_cap_cents, spend_change_approval_id",
    nextStep: "Keep spend changes approval-gated and logged before any controlled autopilot work.",
  },
  {
    area: "Lead capture",
    currentSignal: "Sources and approval records",
    missingFields: "form_submissions, phone_clicks, photo_uploads, source_campaign_id",
    nextStep: "Track internal CTA, form, and photo-upload events without publishing landing pages from this app.",
  },
  {
    area: "Revenue attribution",
    currentSignal: "Campaign and CRM ids",
    missingFields: "booked_job_ids, outcome_ids, revenue_cents, attribution_confidence",
    nextStep: "Join approved campaigns to leads, jobs, outcomes, and partner handoffs before ROI reporting.",
  },
] as const;
