import Link from "next/link";

import { AppShell } from "../_components/app-shell";
import { ActionFeedback, PageHeader, Panel, StatusPill, buttonClasses } from "../_components/page-header";
import { audienceSegments, customerTypes, partnerSegments, segmentHealthRows } from "../_data/growth-engine";

const groups = ["Homeowner", "Professional", "Partner"] as const;

export default async function CustomerTypesPage({
  searchParams,
}: {
  searchParams?: Promise<{ action?: string | string[]; group?: string | string[] }>;
}) {
  const query = searchParams ? await searchParams : {};
  const action = getValue(query.action);
  const group = getValue(query.group);

  return (
    <AppShell active="/customer-types">
      <PageHeader
        eyebrow="Customer Types"
        title="Approved customer and partner segments"
        description="The audience map keeps AI copy, routing, and reporting aligned to Big Shoulders' approved personas."
        aside={<StatusPill tone="green">12 approved types</StatusPill>}
      />

      <ActionFeedback
        action={action ?? group}
        messages={{
          "add-partner-type": "Partner type creation requires the live settings workflow.",
          Partner: "Partner segments are the current focus.",
        }}
      />

      <div className="grid min-w-0 items-start gap-4 xl:grid-cols-[minmax(0,1.42fr)_minmax(360px,0.78fr)]">
        <Panel className="module-rise p-0 [animation-delay:70ms]">
          <div className="border-b border-[var(--border-hairline)] px-5 py-5">
            <h2 className="text-xl font-semibold tracking-[-0.02em]">Audience map</h2>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">Approved lead types grouped by the work they drive.</p>
          </div>
          <div className="space-y-0">
            {groups.map((group) => (
              <section className="border-b border-[var(--border-hairline)] p-5 last:border-0" key={group}>
                <div className="mb-4 flex items-center justify-between gap-4">
                  <h3 className="text-lg font-semibold">{group}</h3>
                  <StatusPill tone={group === "Partner" ? "blue" : "green"}>
                    {customerTypes.filter((type) => type.group === group).length} types
                  </StatusPill>
                </div>
                <div className="grid gap-3 lg:grid-cols-2">
                  {customerTypes
                    .filter((type) => type.group === group)
                    .map((type) => (
                      <div className="flex flex-col rounded-md border border-[var(--border-hairline)] bg-[var(--surface-soft)] p-4" key={type.key}>
                        <h4 className="font-semibold">{type.label}</h4>
                        <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">{type.description}</p>
                        <div className="mt-3 flex">
                          <StatusPill tone="amber">{type.primaryAction}</StatusPill>
                        </div>
                      </div>
                    ))}
                </div>
              </section>
            ))}
          </div>
        </Panel>

        <div className="min-w-0 space-y-4">
          <Panel className="module-rise [animation-delay:120ms]">
            <h2 className="text-xl font-semibold tracking-[-0.02em]">Segment mix</h2>
            <div className="mt-5 space-y-4">
              {audienceSegments.map((segment) => (
                <div key={segment.label}>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-semibold">{segment.label}</div>
                      <div className="mt-1 text-sm text-[var(--text-secondary)]">{segment.detail}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono text-xl font-semibold">{segment.count}</div>
                      <div className="text-xs text-[var(--text-secondary)]">{segment.share}</div>
                    </div>
                  </div>
                  <div className="mt-3 h-2 rounded-full bg-[var(--surface-inset)]">
                    <div className="h-2 rounded-full" style={{ width: segment.share, backgroundColor: "var(--priority)" }} />
                  </div>
                </div>
              ))}
            </div>
          </Panel>

          <Panel className="module-rise [animation-delay:170ms]">
            <h2 className="text-xl font-semibold tracking-[-0.02em]">Segment health</h2>
            <div className="mt-5 divide-y divide-[var(--border-hairline)]">
              {segmentHealthRows.map((row) => (
                <div className="flex items-center justify-between gap-4 py-4 first:pt-0 last:pb-0" key={row.label}>
                  <div>
                    <div className="font-semibold">{row.label}</div>
                    <div className="mt-1 text-sm text-[var(--text-secondary)]">{row.value}</div>
                  </div>
                  <StatusPill tone={row.status === "Good" ? "green" : row.status === "Action needed" ? "red" : "amber"}>
                    {row.status}
                  </StatusPill>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      </div>

      <Panel className="module-rise mt-4 p-0 [animation-delay:220ms]">
        <div className="flex flex-col gap-3 border-b border-[var(--border-hairline)] px-5 py-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-xl font-semibold tracking-[-0.02em]">Partner segments</h2>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">Referral and trade channels that should produce repeatable work.</p>
          </div>
          <Link
            className={buttonClasses({ variant: "primary" })}
            href="/customer-types?action=add-partner-type"
          >
            Add partner type
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-separate border-spacing-0 text-left text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-[0.14em] text-[var(--text-muted)]">
                <th className="px-5 py-4">Segment</th>
                <th className="px-4 py-4">Type</th>
                <th className="px-4 py-4 text-right">Partners</th>
                <th className="px-4 py-4 text-right">Leads</th>
                <th className="px-4 py-4">Quality</th>
                <th className="px-5 py-4">Status</th>
              </tr>
            </thead>
            <tbody>
              {partnerSegments.map((row) => (
                <tr key={row.segment}>
                  <td className="border-t border-[var(--border-hairline)] px-5 py-4 font-semibold">{row.segment}</td>
                  <td className="border-t border-[var(--border-hairline)] px-4 py-4 text-[var(--text-secondary)]">{row.type}</td>
                  <td className="border-t border-[var(--border-hairline)] px-4 py-4 text-right font-mono">{row.partners}</td>
                  <td className="border-t border-[var(--border-hairline)] px-4 py-4 text-right font-mono">{row.leads}</td>
                  <td className="border-t border-[var(--border-hairline)] px-4 py-4">
                    <StatusPill tone={row.quality === "High" ? "green" : "amber"}>{row.quality}</StatusPill>
                  </td>
                  <td className="border-t border-[var(--border-hairline)] px-5 py-4">
                    <StatusPill tone="green">{row.status}</StatusPill>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </AppShell>
  );
}

function getValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
