import { AppShell } from "../_components/app-shell";
import { PageHeader, Panel, StatusPill } from "../_components/page-header";
import { reportMetrics, reportRows, responseRows } from "../_data/growth-engine";

export default function ReportsPage() {
  return (
    <AppShell active="/reports">
      <PageHeader
        eyebrow="Reports"
        title="See which channels create real restoration work"
        description="Attribution reports connect leads, partners, jobs, outcomes, response time, and revenue so Big Shoulders can invest in the channels that actually convert."
        aside={<StatusPill tone="amber">Persistence not connected</StatusPill>}
      />

      <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
        {reportMetrics.map((metric) => (
          <Panel className="module-rise [animation-delay:70ms]" key={metric.label}>
            <div className="text-sm text-[#6e6962]">{metric.label}</div>
            <div className="mt-2 font-mono text-3xl font-semibold tracking-[-0.05em]">{metric.value}</div>
            <div className="mt-3 inline-flex rounded-md bg-[#e4f5eb] px-2 py-1 text-xs font-semibold text-[#117343]">
              {metric.delta}
            </div>
          </Panel>
        ))}
      </div>

      <div className="mt-4 grid min-w-0 items-start gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(360px,0.75fr)]">
        <Panel className="module-rise p-0 [animation-delay:120ms]">
          <div className="flex flex-col gap-3 border-b border-[#e7e0d8] px-5 py-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-xl font-semibold tracking-[-0.02em]">Revenue attribution</h2>
              <p className="mt-1 text-sm text-[#6e6962]">Sample view of channel value until live outcomes are connected.</p>
            </div>
            <button className="min-h-11 rounded-md bg-[#151515] px-4 text-sm font-semibold text-white transition active:-translate-y-px">
              Export view
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-separate border-spacing-0 text-left text-sm">
              <thead>
                <tr className="text-xs uppercase tracking-[0.14em] text-[#7a736b]">
                  <th className="px-5 py-4">Source</th>
                  <th className="px-4 py-4 text-right">Leads</th>
                  <th className="px-4 py-4 text-right">Jobs</th>
                  <th className="px-4 py-4 text-right">Conversion</th>
                  <th className="px-5 py-4 text-right">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {reportRows.map((row) => (
                  <tr key={row.source}>
                    <td className="border-t border-[#eee8e1] px-5 py-4 font-semibold">{row.source}</td>
                    <td className="border-t border-[#eee8e1] px-4 py-4 text-right font-mono">{row.leads}</td>
                    <td className="border-t border-[#eee8e1] px-4 py-4 text-right font-mono">{row.jobs}</td>
                    <td className="border-t border-[#eee8e1] px-4 py-4 text-right font-mono">{row.conversion}</td>
                    <td className="border-t border-[#eee8e1] px-5 py-4 text-right font-mono font-semibold">{row.revenue}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <div className="min-w-0 space-y-4">
          <Panel className="module-rise [animation-delay:170ms]">
            <h2 className="text-xl font-semibold tracking-[-0.02em]">Response SLA</h2>
            <div className="mt-5 space-y-4">
              {responseRows.map((row) => (
                <div className="grid grid-cols-[1fr_auto] gap-4 border-b border-[#eee8e1] pb-4 last:border-0 last:pb-0" key={row.priority}>
                  <div>
                    <div className="font-semibold">{row.priority}</div>
                    <div className="mt-1 text-sm text-[#6e6962]">Target: {row.sla}</div>
                  </div>
                  <div className="font-mono text-xl font-semibold">{row.response}</div>
                </div>
              ))}
            </div>
          </Panel>

          <Panel className="module-rise [animation-delay:220ms]">
            <h2 className="text-xl font-semibold tracking-[-0.02em]">Report readiness</h2>
            <div className="mt-5 space-y-4">
              {[
                ["Lead source", "Connected"],
                ["Job outcome", "Schema ready"],
                ["Revenue rows", "Persistence not connected"],
                ["Partner attribution", "Schema ready"],
              ].map(([label, status]) => (
                <div className="flex items-center justify-between gap-4 border-b border-[#eee8e1] pb-4 last:border-0 last:pb-0" key={label}>
                  <div className="font-semibold">{label}</div>
                  <StatusPill tone={status === "Persistence not connected" ? "amber" : "green"}>{status}</StatusPill>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_1.3fr]">
        <Panel className="module-rise [animation-delay:260ms]">
          <h2 className="text-xl font-semibold tracking-[-0.02em]">Best channel this week</h2>
          <div className="mt-6 rounded-md bg-[#151515] p-6 text-white">
            <div className="text-sm text-white/62">Referral quality leader</div>
            <div className="mt-2 text-3xl font-semibold tracking-[-0.04em]">Plumbing partners</div>
            <p className="mt-4 text-sm leading-6 text-white/68">
              Highest job conversion with faster response time and cleaner loss descriptions.
            </p>
          </div>
        </Panel>

        <Panel className="module-rise [animation-delay:300ms]">
          <h2 className="text-xl font-semibold tracking-[-0.02em]">Next report to connect</h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-[#6e6962]">
            Once accepted leads persist to Supabase, this page can replace sample rows with live
            joins from leads to jobs to outcomes. That unlocks true gross margin attribution by
            customer type, company, partner, and source.
          </p>
        </Panel>
      </div>
    </AppShell>
  );
}
