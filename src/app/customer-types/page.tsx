import { AppShell } from "../_components/app-shell";
import { PageHeader, Panel, StatusPill } from "../_components/page-header";
import { audienceSegments, customerTypes, partnerSegments, segmentHealthRows } from "../_data/growth-engine";

const groups = ["Homeowner", "Professional", "Partner"] as const;

export default function CustomerTypesPage() {
  return (
    <AppShell active="/customer-types">
      <PageHeader
        eyebrow="Customer Types"
        title="Know exactly who each lead belongs to"
        description="The audience map keeps AI copy, routing, and reporting aligned to approved Big Shoulders customer and partner segments."
        aside={<StatusPill tone="green">12 approved types</StatusPill>}
      />

      <div className="grid min-w-0 items-start gap-4 xl:grid-cols-[minmax(0,1.42fr)_minmax(360px,0.78fr)]">
        <Panel className="module-rise p-0 [animation-delay:70ms]">
          <div className="border-b border-[#e7e0d8] px-5 py-5">
            <h2 className="text-xl font-semibold tracking-[-0.02em]">Audience map</h2>
            <p className="mt-1 text-sm text-[#6e6962]">Approved lead types grouped by the work they drive.</p>
          </div>
          <div className="space-y-0">
            {groups.map((group) => (
              <section className="border-b border-[#eee8e1] p-5 last:border-0" key={group}>
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
                      <div className="flex flex-col rounded-md border border-[#ddd6cd] bg-[#fbfaf8] p-4" key={type.key}>
                        <h4 className="font-semibold">{type.label}</h4>
                        <p className="mt-2 text-sm leading-6 text-[#6e6962]">{type.description}</p>
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
                      <div className="mt-1 text-sm text-[#6e6962]">{segment.detail}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono text-xl font-semibold">{segment.count}</div>
                      <div className="text-xs text-[#6e6962]">{segment.share}</div>
                    </div>
                  </div>
                  <div className="mt-3 h-2 rounded-full bg-[#eee8e1]">
                    <div className="h-2 rounded-full bg-[#e7352f]" style={{ width: segment.share }} />
                  </div>
                </div>
              ))}
            </div>
          </Panel>

          <Panel className="module-rise [animation-delay:170ms]">
            <h2 className="text-xl font-semibold tracking-[-0.02em]">Segment health</h2>
            <div className="mt-5 divide-y divide-[#eee8e1]">
              {segmentHealthRows.map((row) => (
                <div className="flex items-center justify-between gap-4 py-4 first:pt-0 last:pb-0" key={row.label}>
                  <div>
                    <div className="font-semibold">{row.label}</div>
                    <div className="mt-1 text-sm text-[#6e6962]">{row.value}</div>
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
        <div className="flex flex-col gap-3 border-b border-[#e7e0d8] px-5 py-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-xl font-semibold tracking-[-0.02em]">Partner segments</h2>
            <p className="mt-1 text-sm text-[#6e6962]">Referral and trade channels that should produce repeatable work.</p>
          </div>
          <button className="min-h-11 rounded-md bg-[#151515] px-4 text-sm font-semibold text-white transition active:-translate-y-px">
            Add partner type
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-separate border-spacing-0 text-left text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-[0.14em] text-[#7a736b]">
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
                  <td className="border-t border-[#eee8e1] px-5 py-4 font-semibold">{row.segment}</td>
                  <td className="border-t border-[#eee8e1] px-4 py-4 text-[#6e6962]">{row.type}</td>
                  <td className="border-t border-[#eee8e1] px-4 py-4 text-right font-mono">{row.partners}</td>
                  <td className="border-t border-[#eee8e1] px-4 py-4 text-right font-mono">{row.leads}</td>
                  <td className="border-t border-[#eee8e1] px-4 py-4">
                    <StatusPill tone={row.quality === "High" ? "green" : "amber"}>{row.quality}</StatusPill>
                  </td>
                  <td className="border-t border-[#eee8e1] px-5 py-4">
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
