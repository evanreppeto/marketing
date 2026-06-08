import { connection } from "next/server";

import { IntelligencePanel } from "../_components/intelligence-panel";
import { EmptyState, PageHeader, StatusPill } from "../_components/page-header";
import { TabNav } from "../_components/tab-nav";
import { MetricStrip, WorkspacePanel } from "../_components/workspace";
import { getPerformanceReadModel, type PerformanceBreakdown, type PerformanceTone } from "@/lib/performance/read-model";

type PerformanceTabKey = "overview" | "leads" | "conversion" | "campaigns" | "partners" | "revenue" | "contract";

type ReportsSearchParams = {
  tab?: string | string[];
};

const performanceTabs: Array<{ key: PerformanceTabKey; label: string; detail: string }> = [
  { key: "overview", label: "Overview", detail: "Top metrics and measurement posture." },
  { key: "leads", label: "Leads", detail: "Persona and source volume." },
  { key: "conversion", label: "Conversion", detail: "Booking, estimate, and close signals." },
  { key: "campaigns", label: "Campaigns", detail: "Package and approval performance." },
  { key: "partners", label: "Partners", detail: "Referral and partner attribution." },
  { key: "revenue", label: "Revenue", detail: "Persona revenue and CTA events." },
  { key: "contract", label: "Data contract", detail: "Backend fields still needed." },
];

export default async function ReportsPage({ searchParams }: { searchParams?: Promise<ReportsSearchParams> }) {
  await connection();

  const query = searchParams ? await searchParams : {};
  const activeTab = normalizeTab(query.tab);
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
          href: `/reports?tab=${metricTab(metric.label)}`,
        }))}
      />

      <TabNav
        ariaLabel="Performance sections"
        activeKey={activeTab}
        columns="sm:grid-cols-2 xl:grid-cols-7"
        className="mb-5"
        tabs={performanceTabs.map((tab) => ({
          key: tab.key,
          label: tab.label,
          detail: tab.detail,
          href: `/reports?tab=${tab.key}`,
        }))}
      />

      <div className="grid min-w-0 gap-5 2xl:grid-cols-[minmax(0,1fr)_430px]">
        <div className="min-w-0">
          {activeTab === "overview" ? <PerformanceOverview performance={performance} /> : null}
          {activeTab === "leads" ? <LeadVolumeTab performance={performance} /> : null}
          {activeTab === "conversion" ? <ConversionTab rows={performance.conversionSignals} /> : null}
          {activeTab === "campaigns" ? <CampaignSignalsTab rows={performance.campaignSignals} /> : null}
          {activeTab === "partners" ? <PartnerSignalsTab rows={performance.partnerSignals} /> : null}
          {activeTab === "revenue" ? <RevenueTab performance={performance} /> : null}
          {activeTab === "contract" ? <ContractTab contracts={performance.contracts} /> : null}
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

function PerformanceOverview({ performance }: { performance: Extract<Awaited<ReturnType<typeof getPerformanceReadModel>>, { status: "live" }> }) {
  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <WorkspacePanel
        eyebrow="Measurement posture"
        title="What is usable now"
        description="Live records can show volume, package counts, approval volume, and partial revenue signals. Anything tied to spend, booking quality, or ROI still needs explicit backend fields."
      >
        <SignalGrid rows={[...performance.conversionSignals.slice(0, 3), ...performance.campaignSignals.slice(0, 2)]} />
      </WorkspacePanel>
      <WorkspacePanel
        eyebrow="Revenue intelligence"
        title="What Mark should not infer"
        description="The dashboard should expose missing attribution instead of pretending the data is complete."
      >
        <SignalList
          rows={performance.contracts.slice(0, 4).map((contract) => ({
            label: contract.area,
            value: "Needed",
            detail: contract.nextBackendStep,
            tone: "amber" as const,
          }))}
        />
      </WorkspacePanel>
    </div>
  );
}

function LeadVolumeTab({ performance }: { performance: Extract<Awaited<ReturnType<typeof getPerformanceReadModel>>, { status: "live" }> }) {
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

function ConversionTab({ rows }: { rows: PerformanceBreakdown[] }) {
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

function CampaignSignalsTab({ rows }: { rows: PerformanceBreakdown[] }) {
  return (
    <BreakdownPanel
      eyebrow="Campaigns"
      title="Package performance structure"
      description="Campaign packages, creative assets, and approvals exist now; impressions, clicks, spend, and booked jobs need backend fields."
      rows={rows}
      empty="No campaign packages are available yet."
    />
  );
}

function PartnerSignalsTab({ rows }: { rows: PerformanceBreakdown[] }) {
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

function RevenueTab({ performance }: { performance: Extract<Awaited<ReturnType<typeof getPerformanceReadModel>>, { status: "live" }> }) {
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

function ContractTab({ contracts }: { contracts: Extract<Awaited<ReturnType<typeof getPerformanceReadModel>>, { status: "live" }>["contracts"] }) {
  return (
    <WorkspacePanel
      eyebrow="Backend contract"
      title="Fields needed for real revenue intelligence"
      description="These are the database/API fields Mark needs before optimization recommendations become trustworthy."
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

function ReportsHeader({ status }: { status: string }) {
  return (
    <PageHeader
      eyebrow="Performance / Intelligence"
      title="Attribute growth work to leads, partners, campaigns, and revenue."
      description="This is the measurement layer for the Growth Intelligence CRM. It uses existing backend signals now and shows exactly which fields are still needed."
      aside={
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill tone="amber">{status}</StatusPill>
          <StatusPill tone="amber">Outbound locked</StatusPill>
          <StatusPill tone="amber">No publishing</StatusPill>
        </div>
      }
    />
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
      <div className="mt-3 font-display text-2xl font-black tracking-[-0.04em] text-[var(--text-primary)]">{row.value}</div>
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

  return <span className={`shrink-0 rounded-md border px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.12em] ${className}`}>{label}</span>;
}

function normalizeTab(value: string | string[] | undefined): PerformanceTabKey {
  const tab = Array.isArray(value) ? value[0] : value;
  return performanceTabs.some((item) => item.key === tab) ? (tab as PerformanceTabKey) : "overview";
}

function metricTab(label: string): PerformanceTabKey {
  if (/lead/i.test(label)) return "leads";
  if (/job|booking/i.test(label)) return "conversion";
  if (/campaign/i.test(label)) return "campaigns";
  if (/revenue/i.test(label)) return "revenue";
  return "overview";
}
