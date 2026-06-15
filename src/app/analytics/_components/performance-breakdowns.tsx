import { EmptyState } from "@/app/_components/page-header";
import { WorkspacePanel } from "@/app/_components/workspace";
import type { PerformanceBreakdown, PerformanceReadModel, PerformanceTone } from "@/lib/performance/read-model";

type LivePerformance = Extract<PerformanceReadModel, { status: "live" }>;

export function LeadVolumeTab({ performance }: { performance: LivePerformance }) {
  return (
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
  );
}

export function ConversionTab({ rows }: { rows: PerformanceBreakdown[] }) {
  return (
    <WorkspacePanel
      eyebrow="Conversion"
      title="Booking, estimate, and close signals"
      description="These use existing lead, job, and outcome rows. Anything labeled proxy is not a final business KPI yet."
    >
      <SignalGrid rows={rows} />
    </WorkspacePanel>
  );
}

export function PartnerSignalsTab({ rows }: { rows: PerformanceBreakdown[] }) {
  return (
    <BreakdownPanel
      eyebrow="Partners"
      title="Referral attribution structure"
      description="Partner-tiered companies are visible now; referral count and revenue need explicit attribution."
      rows={rows}
      empty="No partner records are available yet."
    />
  );
}

export function RevenueTab({ performance }: { performance: LivePerformance }) {
  return (
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
              <ToneTag tone={row.tone} />
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

  return <span className={`shrink-0 rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] ${className}`}>{label}</span>;
}
