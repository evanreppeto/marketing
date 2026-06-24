import { WorkspacePanel } from "@/app/_components/workspace";
import type { PerformanceBreakdown, PerformanceReadModel, PerformanceTone } from "@/lib/performance/read-model";

import { toChartPoints } from "./campaign-analytics-model";
import { BarBreakdown } from "./charts/bar-breakdown";
import { ToggleChart } from "./charts/toggle-chart";
import { FunnelFlow } from "./charts/funnel-flow";

type LivePerformance = Extract<PerformanceReadModel, { status: "live" }>;

export function LeadVolumeTab({ performance }: { performance: LivePerformance }) {
  const byPersona = toChartPoints(performance.leadVolumeByPersona);
  const bySource = toChartPoints(performance.leadVolumeBySource);
  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <WorkspacePanel eyebrow="Lead volume" title="By persona" description="Current lead records grouped by persona.">
        <ToggleChart points={byPersona.points} missing={byPersona.missing} emptyTitle="No persona data yet" emptyDetail="Lead records do not have persona data yet." />
      </WorkspacePanel>
      <WorkspacePanel eyebrow="Lead volume" title="By source" description="Where current lead records came from.">
        <ToggleChart points={bySource.points} missing={bySource.missing} emptyTitle="No source data yet" emptyDetail="No lead source values are available yet." />
      </WorkspacePanel>
    </div>
  );
}

export function ConversionTab({ performance }: { performance: LivePerformance }) {
  return (
    <div className="space-y-5">
      <WorkspacePanel eyebrow="Conversion" title="Lead to booked work" description="How many leads become bookings, and bookings become won work. Counts only — no faked rates.">
        <FunnelFlow stages={performance.funnelStages} />
      </WorkspacePanel>
      <WorkspacePanel
        eyebrow="Conversion"
        title="Booking, estimate, and close signals"
        description="These use existing lead, job, and outcome rows. Anything labeled proxy is not a final business KPI yet."
      >
        <SignalGrid rows={performance.conversionSignals} />
      </WorkspacePanel>
    </div>
  );
}

export function PartnerSignalsTab({ rows }: { rows: PerformanceBreakdown[] }) {
  const { points, missing } = toChartPoints(rows);
  return (
    <WorkspacePanel eyebrow="Partners" title="Referral attribution structure" description="Partner-tiered companies are visible now; referral count and revenue need explicit attribution.">
      <BarBreakdown points={points} missing={missing} emptyTitle="No partner records yet" emptyDetail="No partner records are available yet." />
    </WorkspacePanel>
  );
}

export function RevenueTab({ performance }: { performance: LivePerformance }) {
  const revenue = toChartPoints(performance.revenueByPersona);
  const cta = toChartPoints(performance.ctaSignals);
  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <WorkspacePanel eyebrow="Revenue intelligence" title="Revenue by persona" description="Outcome revenue grouped by persona when present.">
        <ToggleChart points={revenue.points} missing={revenue.missing} valueFormat="usd" initial="bars" emptyTitle="No revenue attributed yet" emptyDetail="No outcome revenue by persona exists yet." />
      </WorkspacePanel>
      <WorkspacePanel eyebrow="CTA events" title="Form, photo-upload, and landing conversion" description="Internal reporting only.">
        <BarBreakdown points={cta.points} missing={cta.missing} emptyTitle="No CTA events yet" emptyDetail="No CTA/form/photo-upload events are tracked yet." />
      </WorkspacePanel>
    </div>
  );
}

export function ContractTab({ contracts }: { contracts: LivePerformance["contracts"] }) {
  return (
    <WorkspacePanel
      eyebrow="Backend contract"
      title="Fields needed for real revenue intelligence"
      description="These are the database/API fields needed before optimization recommendations become trustworthy."
    >
      <div className="divide-y divide-[var(--border-hairline)]">
        {contracts.map((contract) => (
          <div className="grid gap-3 px-5 py-4 lg:grid-cols-[180px_minmax(0,1fr)]" key={contract.area}>
            <div>
              <div className="font-bold text-[var(--text-primary)]">{contract.area}</div>
              <div className="mt-1 text-xs font-medium text-[var(--accent)]">{contract.currentSignal}</div>
            </div>
            <div className="space-y-2">
              <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-3 py-2">
                <div className="text-xs font-medium text-[var(--text-muted)]">Missing fields</div>
                <div className="mt-1 font-mono text-xs leading-5 text-[var(--text-secondary)]">{contract.missingFields}</div>
              </div>
              <p className="text-sm leading-6 text-[var(--text-secondary)]">{contract.nextBackendStep}</p>
            </div>
          </div>
        ))}
      </div>
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

function SignalCard({ row }: { row: PerformanceBreakdown }) {
  return (
    <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-inset)] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="font-bold text-[var(--text-primary)]">{row.label}</div>
        <ToneTag tone={row.tone} />
      </div>
      <div className="mt-3 font-display text-2xl font-bold tracking-[-0.04em] text-[var(--text-primary)]">{row.value}</div>
      <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">{row.detail}</p>
    </div>
  );
}

function ToneTag({ tone }: { tone: PerformanceTone }) {
  const label =
    tone === "green"
      ? "Ready"
      : tone === "amber"
        ? "Needs data"
        : tone === "red"
          ? "Risk"
          : tone === "blue"
            ? "Live"
            : "Empty";

  const className =
    tone === "green"
      ? "border-[oklch(0.78_0.14_158/0.36)] bg-[oklch(0.78_0.14_158/0.12)] text-[oklch(0.88_0.1_158)]"
      : tone === "amber"
        ? "border-[oklch(0.82_0.13_85/0.36)] bg-[oklch(0.82_0.13_85/0.12)] text-[oklch(0.9_0.09_85)]"
        : tone === "red"
          ? "border-[oklch(0.68_0.2_26/0.4)] bg-[oklch(0.68_0.2_26/0.13)] text-[oklch(0.86_0.09_26)]"
          : tone === "blue"
            ? "border-[oklch(0.74_0.115_232/0.34)] bg-[var(--accent-soft)] text-[var(--accent)]"
            : "border-[var(--border-hairline)] bg-[var(--surface-soft)] text-[var(--text-muted)]";

  return <span className={`shrink-0 rounded-md border px-2 py-0.5 text-[10px] font-medium ${className}`}>{label}</span>;
}
