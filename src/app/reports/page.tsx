import Link from "next/link";

import { AppShell } from "../_components/app-shell";
import { ActionFeedback, PageHeader, Panel, StatusPill } from "../_components/page-header";
import { reportMetrics, reportRows, responseRows } from "../_data/growth-engine";

const attributionNotes = [
  {
    label: "Best conversion",
    value: "Plumbing Partners",
    detail: "23.0% sample conversion with fewer, cleaner referrals.",
  },
  {
    label: "Highest volume",
    value: "Insurance Agents",
    detail: "Largest sample lead pool and strongest booked revenue.",
  },
  {
    label: "Needs proof",
    value: "Online / Website",
    detail: "Lower sample conversion until job outcomes are connected.",
  },
];

const revenueMix = [
  { source: "Insurance Agents", share: "43%", width: "w-[86%]" },
  { source: "Property Managers", share: "25%", width: "w-[50%]" },
  { source: "Plumbing Partners", share: "22%", width: "w-[44%]" },
  { source: "Online / Website", share: "10%", width: "w-[20%]" },
];

export default async function ReportsPage({
  searchParams,
}: {
  searchParams?: Promise<{ action?: string | string[] }>;
}) {
  const query = searchParams ? await searchParams : {};
  const action = getAction(query.action);

  return (
    <AppShell active="/reports">
      <PageHeader
        eyebrow="Reports"
        title="Channel attribution and revenue"
        description="Connect leads, partners, jobs, outcomes, and response time to see which channels convert."
        aside={<StatusPill tone="amber">Persistence not connected</StatusPill>}
      />

      <ActionFeedback
        action={action}
        messages={{
          "export-view": "Report export previewed. A real export will be connected after persistence.",
        }}
      />

      {(() => {
        const [primary, ...supporting] = reportMetrics;
        return (
          <Panel className="module-rise p-0 [animation-delay:70ms]">
            <div className="grid items-stretch gap-0 md:grid-cols-[minmax(220px,1.1fr)_minmax(0,2.4fr)]">
              <div className="border-b border-[#eee8e1] px-5 py-5 md:border-b-0 md:border-r">
                <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7a736b]">
                  {primary.label}
                </div>
                <div className="mt-2 font-mono text-[44px] font-semibold leading-none tabular-nums tracking-[-0.05em] text-[#151515]">
                  {primary.value}
                </div>
                <div className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-[#bfe3cc] bg-[#eef7f1] px-2 py-0.5 text-[11px] font-medium text-[#117343]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#23a455]" aria-hidden="true" />
                  {primary.delta} vs prior period
                </div>
              </div>
              <div className="grid grid-cols-2 divide-x divide-[#eee8e1] md:grid-cols-5">
                {supporting.map((metric) => (
                  <div className="px-4 py-4" key={metric.label}>
                    <div className="text-xs text-[#7a736b]">{metric.label}</div>
                    <div className="mt-1.5 font-mono text-xl font-semibold tabular-nums tracking-[-0.02em]">
                      {metric.value}
                    </div>
                    <div className="mt-1.5 text-[11px] font-medium text-[#117343]">{metric.delta}</div>
                  </div>
                ))}
              </div>
            </div>
          </Panel>
        );
      })()}

      <div className="mt-4 grid min-w-0 items-start gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(360px,0.75fr)]">
        <Panel className="module-rise p-0 [animation-delay:120ms]">
          <div className="flex flex-col gap-3 border-b border-[#e7e0d8] px-5 py-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-xl font-semibold tracking-[-0.02em]">Revenue attribution</h2>
              <p className="mt-1 text-sm text-[#6e6962]">Sample view of channel value until live outcomes are connected.</p>
            </div>
            <Link
              className="inline-flex min-h-11 items-center rounded-md bg-[#151515] px-4 text-sm font-semibold text-white transition hover:bg-[#2a2a2a] active:-translate-y-px"
              href="/reports?action=export-view"
            >
              Export view
            </Link>
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

          <div className="grid border-t border-[#e7e0d8] lg:grid-cols-[1fr_1fr]">
            <div className="border-b border-[#eee8e1] p-5 lg:border-b-0 lg:border-r">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h3 className="font-semibold">Attribution readout</h3>
                  <p className="mt-1 text-sm leading-6 text-[#6e6962]">
                    Sample signals to validate once outcomes persist.
                  </p>
                </div>
                <StatusPill tone="amber">Sample</StatusPill>
              </div>
              <div className="mt-5 grid gap-3">
                {attributionNotes.map((note) => (
                  <div className="rounded-md border border-[#ddd6cd] bg-[#fbfaf8] p-4" key={note.label}>
                    <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7a736b]">{note.label}</div>
                    <div className="mt-2 font-semibold">{note.value}</div>
                    <p className="mt-1 text-sm leading-6 text-[#6e6962]">{note.detail}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-5">
              <h3 className="font-semibold">Revenue mix preview</h3>
              <p className="mt-1 text-sm leading-6 text-[#6e6962]">
                Placeholder distribution for the future outcome join.
              </p>
              <div className="mt-5 space-y-4">
                {revenueMix.map((row) => (
                  <div key={row.source}>
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="font-semibold">{row.source}</span>
                      <span className="font-mono text-[#6e6962]">{row.share}</span>
                    </div>
                    <div className="mt-2 h-2 rounded-full bg-[#eee8e1]">
                      <div className={`h-full rounded-full bg-[#b42318] shadow-[0_0_0_1px_rgba(255,255,255,0.08)] ${row.width}`} />
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-6 rounded-md border border-[#ddd6cd] bg-white p-4">
                <div className="text-sm font-semibold">Next connection</div>
                <p className="mt-2 text-sm leading-6 text-[#6e6962]">
                  Replace these sample percentages with lead, job, outcome, and gross-margin rows from Supabase.
                </p>
              </div>
            </div>
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
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold tracking-[-0.01em]">Best channel this week</h2>
            <StatusPill tone="green">Leader</StatusPill>
          </div>
          <div className="mt-4 grid gap-4">
            <div className="flex items-baseline justify-between gap-4 border-b border-[#eee8e1] pb-3">
              <div className="text-lg font-semibold text-[#151515]">Plumbing partners</div>
              <div className="font-mono text-sm font-semibold tabular-nums text-[#117343]">23.0%</div>
            </div>
            <p className="text-sm leading-6 text-[#6e6962]">
              Highest job conversion with faster response time and cleaner loss descriptions.
            </p>
          </div>
        </Panel>

        <Panel className="module-rise [animation-delay:300ms]">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold tracking-[-0.01em]">Next report to connect</h2>
            <StatusPill tone="amber">Pending data</StatusPill>
          </div>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-[#6e6962]">
            Once accepted leads persist to Supabase, this page can replace sample rows with live
            joins from leads to jobs to outcomes — unlocking true gross-margin attribution by
            customer type, company, partner, and source.
          </p>
        </Panel>
      </div>
    </AppShell>
  );
}

function getAction(action: string | string[] | undefined) {
  return Array.isArray(action) ? action[0] : action;
}
