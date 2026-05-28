import Link from "next/link";

import { AppShell } from "../_components/app-shell";
import { ActionFeedback, OperatorBar, PageHeader, Panel, StatusPill } from "../_components/page-header";
import {
  coreObjects,
  foundationIssues,
  integrityScannerRules,
  integrityScanStats,
  pipelineStatus,
  validationRows,
} from "../_data/growth-engine";

export default async function DataFoundationPage({
  searchParams,
}: {
  searchParams?: Promise<{ action?: string | string[] }>;
}) {
  const query = searchParams ? await searchParams : {};
  const action = getAction(query.action);

  return (
    <AppShell active="/data-foundation">
      <PageHeader
        eyebrow="Data Foundation"
        title="Records, relationships, and integrity"
        description="Every company, person, property, lead, job, and result is checked before automations can run."
        aside={<HeaderStatus />}
      />

      <OperatorBar
        task="Clean the records that would block routing or reporting."
        detail="Start with missing contact fields, duplicate companies, and orphaned properties before connecting live automation."
        status="5 cleanup items"
        secondary={
          <Link
            className="inline-flex min-h-11 items-center justify-center rounded-md border border-[#ddd6cd] bg-white px-4 text-sm font-semibold transition hover:border-[#151515] active:-translate-y-px"
            href="/crm"
          >
            Open CRM
          </Link>
        }
        primary={
          <Link
            className="inline-flex min-h-11 items-center justify-center rounded-md bg-[#151515] px-4 text-sm font-semibold text-white transition hover:bg-[#2a2a2a] active:-translate-y-px"
            href="/data-foundation?action=review-queue"
          >
            Review queue
          </Link>
        }
      />
      <ActionFeedback
        action={action}
        messages={{
          "review-queue": "Integrity queue is in review mode. This is a scaffold preview; no records were changed.",
          "fix-record": "Record cleanup action previewed. Persistence is not connected yet.",
          "run-integrity-scan": "Automated integrity scan previewed. The scanner would inspect CRM records and refresh this queue.",
          "configure-scanner": "Scanner rule configuration previewed. Rules are still mock-only until persistence is connected.",
        }}
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
                  <div className="border-b border-[#5bb7e8]/25 bg-[#123250] px-5 py-6 shadow-[inset_4px_0_0_#5bb7e8]">
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

      <Panel className="module-rise mt-4 p-0 [animation-delay:150ms]">
        <div className="flex flex-col gap-3 border-b border-[#e7e0d8] px-5 py-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-xl font-semibold tracking-[-0.02em]">Automated integrity scanner</h2>
            <p className="mt-1 text-sm text-[#6e6962]">
              Searches the CRM model for missing fields, duplicate records, orphaned relationships, and routing blockers.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Link
              className="inline-flex min-h-11 items-center justify-center rounded-md border border-[#ddd6cd] bg-white px-4 text-sm font-semibold transition hover:border-[#151515] active:-translate-y-px"
              href="/data-foundation?action=configure-scanner"
            >
              Configure rules
            </Link>
            <Link
              className="inline-flex min-h-11 items-center justify-center rounded-md bg-[#151515] px-4 text-sm font-semibold text-white transition hover:bg-[#2a2a2a] active:-translate-y-px"
              href="/data-foundation?action=run-integrity-scan"
            >
              Run scan
            </Link>
          </div>
        </div>

        <div className="grid border-b border-[#eee8e1] md:grid-cols-4">
          {integrityScanStats.map((stat) => (
            <div className="border-b border-[#eee8e1] px-5 py-4 md:border-b-0 md:border-r last:md:border-r-0" key={stat.label}>
              <div className="text-xs text-[#6e6962]">{stat.label}</div>
              <div className="mt-1.5 font-mono text-2xl font-semibold tracking-[-0.04em]">{stat.value}</div>
              <div className="mt-2 inline-flex rounded-md bg-[#fff3d9] px-2 py-1 text-xs font-semibold text-[#875a07]">
                {stat.delta}
              </div>
            </div>
          ))}
        </div>

        <div className="grid gap-0 lg:grid-cols-4">
          {integrityScannerRules.map((rule) => (
            <div className="border-b border-[#eee8e1] p-5 lg:border-r lg:last:border-r-0" key={rule.rule}>
              <div className="flex items-start justify-between gap-3">
                <h3 className="font-semibold">{rule.rule}</h3>
                <StatusPill tone="green">{rule.status}</StatusPill>
              </div>
              <p className="mt-3 text-sm leading-6 text-[#6e6962]">{rule.searches}</p>
              <div className="mt-4 rounded-md border border-[#ddd6cd] bg-[#fbfaf8] p-3">
                <div className="text-xs text-[#6e6962]">Objects scanned</div>
                <div className="mt-1 text-sm font-semibold">{rule.objects}</div>
                <div className="mt-2 text-xs text-[#6e6962]">Cadence: {rule.cadence}</div>
              </div>
            </div>
          ))}
        </div>
      </Panel>

      <div className="mt-4 grid min-w-0 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Panel className="module-rise p-0 [animation-delay:170ms]">
          <div className="flex flex-col gap-3 border-b border-[#e7e0d8] px-5 py-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-xl font-semibold tracking-[-0.02em]">Detected integrity queue</h2>
              <p className="mt-1 text-sm text-[#6e6962]">Findings generated by scanner rules before automation can trust the record.</p>
            </div>
            <Link
              className="inline-flex min-h-11 items-center rounded-md bg-[#151515] px-4 text-sm font-semibold text-white transition hover:bg-[#2a2a2a] active:-translate-y-px"
              href="/data-foundation?action=run-integrity-scan"
            >
              Run scan
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] border-separate border-spacing-0 text-left text-sm">
              <thead>
                <tr className="text-xs uppercase tracking-[0.14em] text-[#7a736b]">
                  <th className="px-5 py-4">Issue</th>
                  <th className="px-4 py-4">Affected records</th>
                  <th className="px-4 py-4">Detected by</th>
                  <th className="px-4 py-4">Impact</th>
                  <th className="px-4 py-4">Confidence</th>
                  <th className="px-4 py-4">Last found</th>
                  <th className="px-5 py-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {foundationIssues.map((row) => (
                  <tr key={row.issue}>
                    <td className="border-t border-[#eee8e1] px-5 py-4 font-semibold">{row.issue}</td>
                    <td className="border-t border-[#eee8e1] px-4 py-4 text-[#6e6962]">{row.affected}</td>
                    <td className="border-t border-[#eee8e1] px-4 py-4">{row.detector}</td>
                    <td className="border-t border-[#eee8e1] px-4 py-4">{row.impact}</td>
                    <td className="border-t border-[#eee8e1] px-4 py-4 font-mono">{row.confidence}</td>
                    <td className="border-t border-[#eee8e1] px-4 py-4 text-[#6e6962]">{row.lastFound}</td>
                    <td className="border-t border-[#eee8e1] px-5 py-4 text-right">
                      <Link href="/data-foundation?action=fix-record">
                        <StatusPill tone={row.action === "Fix" ? "red" : "amber"}>{row.action}</StatusPill>
                      </Link>
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

function getAction(action: string | string[] | undefined) {
  return Array.isArray(action) ? action[0] : action;
}

function HeaderStatus() {
  return (
    <div className="flex items-center gap-2.5 rounded-md border border-[#ddd6cd] bg-white px-3.5 py-2 shadow-[0_18px_45px_-34px_rgba(52,43,34,0.42)]">
      <span className="h-2 w-2 rounded-full bg-[#23a455] status-breathe" />
      <div className="text-xs">
        <span className="font-semibold text-[#151515]">Data contracts ready</span>
        <span className="ml-2 text-[#6e6962]">6 objects</span>
      </div>
    </div>
  );
}
