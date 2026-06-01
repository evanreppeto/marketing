import Link from "next/link";

import { AppShell } from "../_components/app-shell";
import { CountUp } from "../_components/count-up";
import { ActionFeedback, buttonClasses, OperatorBar, PageHeader, Panel, StatusPill } from "../_components/page-header";
import { reportMetrics, reportRows, responseRows } from "../_data/growth-engine";

const attributionNotes = [
  {
    label: "Best conversion",
    value: "Plumbing Partners",
    detail: "23.0% modeled conversion with fewer, cleaner referrals.",
  },
  {
    label: "Highest volume",
    value: "Insurance Agents",
    detail: "Largest modeled lead pool and strongest booked revenue.",
  },
  {
    label: "Needs proof",
    value: "Online / Website",
    detail: "Lower modeled conversion until job outcomes are connected.",
  },
];

const revenueMix = [
  { source: "Insurance Agents", share: "43%", width: "w-[86%]" },
  { source: "Property Managers", share: "25%", width: "w-[50%]" },
  { source: "Plumbing Partners", share: "22%", width: "w-[44%]" },
  { source: "Online / Website", share: "10%", width: "w-[20%]" },
];

const channelActions = [
  {
    label: "Invest next",
    channel: "Plumbing Partners",
    detail: "Best conversion signal. Build the next referral campaign around clean water-loss handoffs.",
    href: "/ai-studio?action=new-campaign",
    action: "Build campaign",
    tone: "green" as const,
  },
  {
    label: "Needs proof",
    channel: "Online / Website",
    detail: "Lower conversion until live outcomes are connected. Add job outcomes before scaling spend.",
    href: "/crm/outcomes",
    action: "Open outcomes",
    tone: "amber" as const,
  },
  {
    label: "Protect volume",
    channel: "Insurance Agents",
    detail: "Largest lead pool. Keep messaging coverage-neutral and route partner-ready leads faster.",
    href: "/persona-intelligence?view=partner-candidates",
    action: "View partners",
    tone: "blue" as const,
  },
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
          "export-view": "Report export requires live attribution data.",
        }}
      />

      <OperatorBar
        task="Act on the strongest channel signal first."
        detail="Plumbing partners are the strongest modeled converter. Build the next partner campaign, then connect outcomes so future reports show true margin."
        status="Recommended next step"
        primary={
          <Link
            className={buttonClasses({ variant: "primary" })}
            href="/ai-studio?action=new-campaign"
          >
            Build partner campaign
          </Link>
        }
        secondary={
          <Link
            className={buttonClasses({ variant: "ghost" })}
            href="/crm/outcomes"
          >
            Connect outcomes
          </Link>
        }
      />

      {(() => {
        const [primary, ...supporting] = reportMetrics;
        return (
          <Panel className="module-rise p-0 [animation-delay:70ms]">
            <div className="grid items-stretch gap-0 md:grid-cols-[minmax(220px,1.1fr)_minmax(0,2.4fr)]">
              <div className="border-b border-[var(--border-hairline)] px-5 py-5 md:border-b-0 md:border-r">
                <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
                  {primary.label}
                </div>
                <div className="mt-2 font-mono text-[44px] font-semibold leading-none tabular-nums tracking-[-0.05em] text-[var(--text-primary)]">
                  <CountUp value={primary.value} />
                </div>
                <div className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-[oklch(0.78_0.14_158/0.3)] bg-[oklch(0.78_0.14_158/0.14)] px-2 py-0.5 text-[11px] font-medium text-[oklch(0.88_0.1_158)]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[oklch(0.78_0.14_158)]" aria-hidden="true" />
                  {primary.delta} vs prior period
                </div>
              </div>
              <div className="grid grid-cols-2 divide-x divide-[var(--border-hairline)] md:grid-cols-5">
                {supporting.map((metric) => (
                  <div className="px-4 py-4" key={metric.label}>
                    <div className="text-xs text-[var(--text-muted)]">{metric.label}</div>
                    <div className="mt-1.5 font-mono text-xl font-semibold tabular-nums tracking-[-0.02em]">
                      <CountUp value={metric.value} />
                    </div>
                    <div className="mt-1.5 text-[11px] font-medium text-[oklch(0.88_0.1_158)]">{metric.delta}</div>
                  </div>
                ))}
              </div>
            </div>
          </Panel>
        );
      })()}

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        {channelActions.map((item) => (
          <Panel className="module-rise [animation-delay:100ms]" key={item.label}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">{item.label}</div>
                <h2 className="mt-2 text-xl font-semibold tracking-[-0.02em]">{item.channel}</h2>
              </div>
              <StatusPill tone={item.tone}>{item.label}</StatusPill>
            </div>
            <p className="mt-3 min-h-[72px] text-sm leading-6 text-[var(--text-secondary)]">{item.detail}</p>
            <Link
              className={buttonClasses({ variant: "ghost", className: "mt-5" })}
              href={item.href}
            >
              {item.action}
            </Link>
          </Panel>
        ))}
      </div>

      <div className="mt-4 grid min-w-0 items-start gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(360px,0.75fr)]">
        <Panel className="module-rise p-0 [animation-delay:120ms]">
          <div className="flex flex-col gap-3 border-b border-[var(--border-hairline)] px-5 py-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-xl font-semibold tracking-[-0.02em]">Revenue attribution</h2>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">Sample view of channel value until live outcomes are connected.</p>
            </div>
            <Link
              className={buttonClasses({ variant: "primary" })}
              href="/reports?action=export-view"
            >
              Export view
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-separate border-spacing-0 text-left text-sm">
              <thead>
                <tr className="text-xs uppercase tracking-[0.14em] text-[var(--text-muted)]">
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
                    <td className="border-t border-[var(--border-hairline)] px-5 py-4 font-semibold">{row.source}</td>
                    <td className="border-t border-[var(--border-hairline)] px-4 py-4 text-right font-mono">{row.leads}</td>
                    <td className="border-t border-[var(--border-hairline)] px-4 py-4 text-right font-mono">{row.jobs}</td>
                    <td className="border-t border-[var(--border-hairline)] px-4 py-4 text-right font-mono">{row.conversion}</td>
                    <td className="border-t border-[var(--border-hairline)] px-5 py-4 text-right font-mono font-semibold">{row.revenue}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid border-t border-[var(--border-hairline)] lg:grid-cols-[1fr_1fr]">
            <div className="border-b border-[var(--border-hairline)] p-5 lg:border-b-0 lg:border-r">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h3 className="font-semibold">Attribution readout</h3>
                  <p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">
                    Sample signals to validate once outcomes persist.
                  </p>
                </div>
                <StatusPill tone="amber">Sample</StatusPill>
              </div>
              <div className="mt-5 grid gap-3">
                {attributionNotes.map((note) => (
                  <div className="rounded-md border border-[var(--border-hairline)] bg-[var(--surface-soft)] p-4" key={note.label}>
                    <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">{note.label}</div>
                    <div className="mt-2 font-semibold">{note.value}</div>
                    <p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">{note.detail}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-5">
              <h3 className="font-semibold">Revenue mix preview</h3>
              <p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">
                Placeholder distribution for the future outcome join.
              </p>
              <div className="mt-5 space-y-4">
                {revenueMix.map((row) => (
                  <div key={row.source}>
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="font-semibold">{row.source}</span>
                      <span className="font-mono text-[var(--text-secondary)]">{row.share}</span>
                    </div>
                    <div className="mt-2 h-2 rounded-full bg-[var(--surface-soft)]">
                      <div className={`h-full rounded-full bg-[var(--priority)] shadow-[0_0_0_1px_rgba(255,255,255,0.08)] ${row.width}`} />
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-6 rounded-md border border-[var(--border-hairline)] bg-[var(--surface-inset)] p-4">
                <div className="text-sm font-semibold">Next connection</div>
                <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
                  Connect lead, job, outcome, and gross-margin rows from Supabase.
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
                <div className="grid grid-cols-[1fr_auto] gap-4 border-b border-[var(--border-hairline)] pb-4 last:border-0 last:pb-0" key={row.priority}>
                  <div>
                    <div className="font-semibold">{row.priority}</div>
                    <div className="mt-1 text-sm text-[var(--text-secondary)]">Target: {row.sla}</div>
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
                <div className="flex items-center justify-between gap-4 border-b border-[var(--border-hairline)] pb-4 last:border-0 last:pb-0" key={label}>
                  <div className="font-semibold">{label}</div>
                  <StatusPill tone={status === "Persistence not connected" ? "amber" : "green"}>{status}</StatusPill>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      </div>

    </AppShell>
  );
}

function getAction(action: string | string[] | undefined) {
  return Array.isArray(action) ? action[0] : action;
}
