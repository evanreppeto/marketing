import { connection } from "next/server";

import { IntelligencePanel } from "../_components/intelligence-panel";
import { EmptyState, StatusPill } from "../_components/page-header";
import { MetricStrip, WorkspacePanel } from "../_components/workspace";
import { getPerformanceReadModel, type PerformanceBreakdown, type PerformanceTone } from "@/lib/performance/read-model";

export default async function ReportsPage() {
  await connection();

  const performance = await getPerformanceReadModel();

  if (performance.status === "unavailable") {
    return (
      <>
        <ReportsHeader status="Unavailable" />
        <EmptyState title="Performance data unavailable" detail={performance.message} />
      </>
    );
  }

  const leadDataReady = performance.leadVolumeByPersona.length > 0 || performance.leadVolumeBySource.length > 0;
  const attributionMissing = performance.contracts.some((contract) => contract.missingFields.length > 0);

  return (
    <>
      <ReportsHeader status="Measurement scaffold" />

      <MetricStrip
        metrics={performance.metrics.map((metric) => ({
          label: metric.label,
          value: metric.value,
          detail: metric.detail,
          tone: metric.tone,
        }))}
      />

      <div className="grid min-w-0 gap-5 2xl:grid-cols-[minmax(0,1fr)_430px]">
        <div className="min-w-0 space-y-5">
          <div className="grid gap-5 xl:grid-cols-2">
            <BreakdownPanel
              eyebrow="Lead volume"
              title="By persona"
              description="Current lead records grouped by persona. Missing persona stays visible instead of being hidden."
              rows={performance.leadVolumeByPersona}
              empty="Lead records do not have persona/source data yet."
            />
            <BreakdownPanel
              eyebrow="Lead volume"
              title="By source"
              description="Where current lead records came from. This becomes source ROI once outcomes are joined."
              rows={performance.leadVolumeBySource}
              empty="No lead source values are available yet."
            />
          </div>

          <WorkspacePanel
            eyebrow="Conversion"
            title="Booking, estimate, and close signals"
            description="These use existing lead, job, and outcome rows. Anything labeled proxy is not a final business KPI yet."
          >
            <SignalGrid rows={performance.conversionSignals} />
          </WorkspacePanel>

          <div className="grid gap-5 xl:grid-cols-2">
            <BreakdownPanel
              eyebrow="Campaigns"
              title="Package performance structure"
              description="Campaign packages, creative assets, and approvals exist now; impressions, clicks, spend, and booked jobs need backend fields."
              rows={performance.campaignSignals}
              empty="No campaign packages are available yet."
            />
            <BreakdownPanel
              eyebrow="Partners"
              title="Referral attribution structure"
              description="Partner-tiered companies are visible now; referral count and revenue need explicit attribution."
              rows={performance.partnerSignals}
              empty="No partner records are available yet."
            />
          </div>

          <div className="grid gap-5 xl:grid-cols-2">
            <BreakdownPanel
              eyebrow="Revenue intelligence"
              title="Revenue by persona"
              description="Uses outcome revenue grouped by persona when present. Missing persona means attribution is incomplete."
              rows={performance.revenueByPersona}
              empty="No outcome revenue by persona exists yet."
            />
            <BreakdownPanel
              eyebrow="CTA events"
              title="Form, photo-upload, and landing conversion"
              description="Internal reporting only. This app does not publish landing pages or execute outbound campaigns."
              rows={performance.ctaSignals}
              empty="No CTA/form/photo-upload events are tracked yet."
            />
          </div>

          <WorkspacePanel
            eyebrow="Backend contract"
            title="Fields needed for real revenue intelligence"
            description="These are the database/API fields Mark needs before optimization recommendations become trustworthy."
          >
            <div className="divide-y divide-[var(--border-hairline)]">
              {performance.contracts.map((contract) => (
                <div className="grid gap-3 px-5 py-4 lg:grid-cols-[180px_minmax(0,1fr)]" key={contract.area}>
                  <div>
                    <div className="font-bold text-[var(--text-primary)]">{contract.area}</div>
                    <div className="mt-1 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--accent)]">{contract.currentSignal}</div>
                  </div>
                  <div className="space-y-2">
                    <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-3 py-2">
                      <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">Missing fields</div>
                      <div className="mt-1 font-mono text-xs leading-5 text-[var(--text-secondary)]">{contract.missingFields}</div>
                    </div>
                    <p className="text-sm leading-6 text-[var(--text-secondary)]">{contract.nextBackendStep}</p>
                  </div>
                </div>
              ))}
            </div>
          </WorkspacePanel>
        </div>

        <aside className="min-w-0 space-y-5 2xl:sticky 2xl:top-5 2xl:self-start">
          <IntelligencePanel
            model={{
              title: "Performance data contract",
              persona: "All personas",
              confidence: leadDataReady ? "Partial live counts" : "Missing attribution",
              journeyStage: "Outcome loop",
              urgency: attributionMissing ? "Backend contract needed" : "Ready for analysis",
              attentionReason: "Revenue intelligence needs attribution joins between leads, campaigns, partners, jobs, outcomes, CTA events, and spend.",
              nextBestAction: "Add campaign results, attribution keys, CTA/form/photo-upload events, partner referrals, and booked-job outcome links.",
              cta: "Do not publish landing pages from this app; keep CTA reporting internal until approved workflows exist.",
              messageAngle: "Measure restoration demand, partner handoff quality, mitigation documentation, and revenue impact without claiming guaranteed outcomes.",
              guardrailStatus: "Reporting only. No ad spend changes, outbound optimization, or publishing can execute without approval.",
              scores: [
                { label: "Lead groups", value: performance.leadVolumeByPersona.length, detail: "Personas with lead volume", tone: leadDataReady ? "blue" : "gray" },
                { label: "Campaign signals", value: performance.campaignSignals.length, detail: "Existing package metrics", tone: "blue" },
                { label: "Attribution", value: attributionMissing ? "Partial" : "Ready", detail: "Backend joins", tone: attributionMissing ? "amber" : "green" },
              ],
              proofPoints: performance.contracts.map((contract) => `${contract.area}: ${contract.nextBackendStep}`),
              outboundLocked: true,
            }}
          />
        </aside>
      </div>
    </>
  );
}

function ReportsHeader({ status }: { status: string }) {
  return (
    <header className="module-rise mb-5 rounded-2xl border border-[var(--border-panel)] bg-[var(--surface-panel)] px-6 py-5 shadow-[var(--elev-panel)]">
      <div className="flex flex-wrap items-center gap-2">
        <span className="signal-eyebrow">Performance / Intelligence</span>
        <StatusPill tone="amber">{status}</StatusPill>
        <StatusPill tone="amber">No publishing</StatusPill>
      </div>
      <h1 className="mt-3 max-w-3xl text-[clamp(1.8rem,3vw,3.2rem)] font-black leading-[0.98] tracking-[-0.05em] text-[var(--text-primary)]">
        Attribute growth work to leads, partners, campaigns, and revenue.
      </h1>
      <p className="mt-3 max-w-[72ch] text-sm leading-6 text-[var(--text-secondary)]">
        This is the measurement layer for the Growth Intelligence CRM. It uses existing backend signals now and shows exactly which fields are still needed.
      </p>
    </header>
  );
}

function BreakdownPanel({
  eyebrow,
  title,
  description,
  rows,
  empty,
}: {
  eyebrow: string;
  title: string;
  description: string;
  rows: PerformanceBreakdown[];
  empty: string;
}) {
  return (
    <WorkspacePanel eyebrow={eyebrow} title={title} description={description}>
      {rows.length > 0 ? <SignalList rows={rows} /> : <EmptyState title="No live signal yet" detail={empty} />}
    </WorkspacePanel>
  );
}

function SignalGrid({ rows }: { rows: PerformanceBreakdown[] }) {
  return (
    <div className="grid gap-3 p-4 md:grid-cols-3">
      {rows.map((row) => (
        <SignalCard key={row.label} row={row} />
      ))}
    </div>
  );
}

function SignalList({ rows }: { rows: PerformanceBreakdown[] }) {
  return (
    <div className="divide-y divide-[var(--border-hairline)]">
      {rows.map((row) => (
        <div className="grid gap-3 px-5 py-4 sm:grid-cols-[minmax(0,1fr)_110px]" key={row.label}>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <div className="font-bold text-[var(--text-primary)]">{row.label}</div>
              <ToneDot tone={row.tone} />
            </div>
            <p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">{row.detail}</p>
          </div>
          <div className="font-mono text-sm font-bold text-[var(--accent)] sm:text-right">{row.value}</div>
        </div>
      ))}
    </div>
  );
}

function SignalCard({ row }: { row: PerformanceBreakdown }) {
  return (
    <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-inset)] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="font-bold text-[var(--text-primary)]">{row.label}</div>
        <ToneDot tone={row.tone} />
      </div>
      <div className="mt-3 font-display text-2xl font-black tracking-[-0.04em] text-[var(--text-primary)]">{row.value}</div>
      <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">{row.detail}</p>
    </div>
  );
}

function ToneDot({ tone }: { tone: PerformanceTone }) {
  const className =
    tone === "green"
      ? "bg-[var(--ok)]"
      : tone === "amber"
        ? "bg-[var(--warn)]"
        : tone === "red"
          ? "bg-[var(--priority)]"
          : tone === "blue"
            ? "bg-[var(--accent)]"
            : "bg-[var(--text-muted)]";
  return <span aria-hidden className={`mt-1 h-2 w-2 shrink-0 rounded-full ${className}`} />;
}
