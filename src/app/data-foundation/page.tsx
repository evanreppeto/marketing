import { AppShell } from "../_components/app-shell";
import { PageHeader, Panel, StatusPill } from "../_components/page-header";
import { coreObjects, foundationIssues, pipelineStatus, validationRows } from "../_data/growth-engine";

export default function DataFoundationPage() {
  return (
    <AppShell active="/data-foundation">
      <PageHeader
        eyebrow="Data Foundation"
        title="Keep every growth record connected"
        description="Before AI drafts, routes, or scores anything, the data foundation checks that every company, person, property, lead, job, and result has the relationships operators need."
        aside={<HeaderStatus />}
      />

      <div className="grid min-w-0 items-start gap-4 xl:grid-cols-[minmax(0,1.42fr)_minmax(360px,0.78fr)]">
        <Panel className="module-rise p-0 [animation-delay:70ms]">
          <div className="border-b border-[#e7e0d8] px-5 py-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-xl font-semibold tracking-[-0.02em]">Relationship model</h2>
                <p className="mt-1 text-sm text-[#6e6962]">Six core objects, one attribution path.</p>
              </div>
              <StatusPill tone="green">Migration drafted</StatusPill>
            </div>
          </div>

          {(() => {
            const hero = coreObjects.find((object) => object.name === "Leads");
            const footer = coreObjects.find((object) => object.name === "Results");
            const supporting = coreObjects.filter(
              (object) => object.name !== "Leads" && object.name !== "Results",
            );

            return (
              <>
                {hero ? (
                  <div className="border-b border-[#eee8e1] bg-[#fbf6ee] px-5 py-6">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="text-xs uppercase tracking-[0.16em] text-[#a07423]">Actionable now</div>
                        <h3 className="mt-2 text-2xl font-semibold tracking-[-0.02em]">{hero.name}</h3>
                        <p className="mt-2 max-w-md text-sm leading-6 text-[#6e6962]">{hero.note}</p>
                      </div>
                      <div className="text-right">
                        <div className="font-mono text-6xl font-semibold leading-none tracking-[-0.07em]">{hero.count}</div>
                        <div className="mt-2 text-xs uppercase tracking-[0.14em] text-[#6e6962]">awaiting review</div>
                      </div>
                    </div>
                  </div>
                ) : null}

                <div className="grid divide-y divide-[#eee8e1] md:grid-cols-2 md:divide-x md:divide-y-0">
                  {supporting.map((object) => (
                    <div className="border-b border-[#eee8e1] p-5 even:md:border-r-0" key={object.name}>
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <h3 className="text-lg font-semibold">{object.name}</h3>
                          <p className="mt-2 text-sm leading-6 text-[#6e6962]">{object.note}</p>
                        </div>
                        <div className="font-mono text-3xl font-semibold tracking-[-0.05em]">{object.count}</div>
                      </div>
                    </div>
                  ))}
                </div>

                {footer ? (
                  <div className="flex items-center justify-between gap-4 border-t border-[#eee8e1] bg-[#fbfaf8] px-5 py-4">
                    <div>
                      <div className="text-sm font-semibold">{footer.name}</div>
                      <div className="mt-0.5 text-xs text-[#6e6962]">{footer.note}</div>
                    </div>
                    <div className="font-mono text-2xl font-semibold tracking-[-0.04em]">{footer.count}</div>
                  </div>
                ) : null}
              </>
            );
          })()}
        </Panel>

        <Panel className="module-rise [animation-delay:120ms]">
          <h2 className="text-xl font-semibold tracking-[-0.02em]">Pipeline health</h2>
          <div className="mt-5 space-y-4">
            {pipelineStatus.map((item) => (
              <div className="grid grid-cols-[1fr_auto] gap-4 border-b border-[#eee8e1] pb-4 last:border-0 last:pb-0" key={item.label}>
                <div>
                  <div className="font-semibold">{item.label}</div>
                  <div className="mt-1 text-sm text-[#6e6962]">{item.meta}</div>
                </div>
                <StatusPill tone={item.value === "Ready" ? "amber" : "green"}>{item.value}</StatusPill>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <div className="mt-4 grid min-w-0 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Panel className="module-rise p-0 [animation-delay:170ms]">
          <div className="flex flex-col gap-3 border-b border-[#e7e0d8] px-5 py-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-xl font-semibold tracking-[-0.02em]">Integrity queue</h2>
              <p className="mt-1 text-sm text-[#6e6962]">Records that need operator cleanup before automation.</p>
            </div>
            <button className="min-h-11 rounded-md bg-[#151515] px-4 text-sm font-semibold text-white transition active:-translate-y-px">
              Review queue
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-separate border-spacing-0 text-left text-sm">
              <thead>
                <tr className="text-xs uppercase tracking-[0.14em] text-[#7a736b]">
                  <th className="px-5 py-4">Issue</th>
                  <th className="px-4 py-4">Affected records</th>
                  <th className="px-4 py-4">Impact</th>
                  <th className="px-4 py-4">Last found</th>
                  <th className="px-5 py-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {foundationIssues.map((row) => (
                  <tr key={row.issue}>
                    <td className="border-t border-[#eee8e1] px-5 py-4 font-semibold">{row.issue}</td>
                    <td className="border-t border-[#eee8e1] px-4 py-4 text-[#6e6962]">{row.affected}</td>
                    <td className="border-t border-[#eee8e1] px-4 py-4">{row.impact}</td>
                    <td className="border-t border-[#eee8e1] px-4 py-4 text-[#6e6962]">{row.lastFound}</td>
                    <td className="border-t border-[#eee8e1] px-5 py-4 text-right">
                      <StatusPill tone={row.action === "Fix" ? "red" : "amber"}>{row.action}</StatusPill>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel className="module-rise [animation-delay:220ms]">
          <h2 className="text-xl font-semibold tracking-[-0.02em]">Gate checks</h2>
          <div className="mt-5 divide-y divide-[#eee8e1]">
            {validationRows.map((row) => (
              <div className="flex items-center justify-between gap-4 py-4 first:pt-0 last:pb-0" key={row.label}>
                <div>
                  <div className="font-semibold">{row.label}</div>
                  <div className="mt-1 text-sm text-[#6e6962]">{row.value}</div>
                </div>
                <StatusPill tone={row.status.includes("Blocked") ? "amber" : row.status.includes("review") ? "amber" : "green"}>
                  {row.status}
                </StatusPill>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </AppShell>
  );
}

function HeaderStatus() {
  return (
    <div className="rounded-md border border-[#ddd6cd] bg-white px-5 py-4 shadow-[0_18px_45px_-34px_rgba(52,43,34,0.42)]">
      <div className="flex items-center gap-3">
        <span className="h-2.5 w-2.5 rounded-full bg-[#23a455] status-breathe" />
        <div>
          <div className="text-sm font-semibold">Data contracts: Ready</div>
          <div className="mt-1 text-sm text-[#6e6962]">Six objects protected</div>
        </div>
      </div>
    </div>
  );
}
