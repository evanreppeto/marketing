import Link from "next/link";

import { AppShell } from "../_components/app-shell";
import { CountUp } from "../_components/count-up";
import { LiveTime } from "../_components/live-time";
import { ActionFeedback, buttonClasses, PageHeader, Panel, StatusPill } from "../_components/page-header";
import {
  coreObjects,
  foundationIssues,
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

      <ActionFeedback
        action={action}
        messages={{
          "review-queue": "Integrity queue opened for review.",
          "fix-record": "Record cleanup requires the live write workflow.",
          "run-integrity-scan": "Integrity scan requires the live scanner workflow.",
          "configure-scanner": "Scanner rules require the live configuration workflow.",
        }}
      />

      <div className="grid min-w-0 items-start gap-4 xl:grid-cols-[minmax(0,1.42fr)_minmax(360px,0.78fr)]">
        <Panel className="module-rise p-0 [animation-delay:70ms]">
          <div className="border-b border-[var(--border-hairline)] px-5 py-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-xl font-semibold tracking-[-0.02em]">Relationship model</h2>
                <p className="mt-1 text-sm text-[var(--text-secondary)]">Six core objects, one attribution path.</p>
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
                  <div className="border-b border-[oklch(0.74_0.115_232/0.34)] bg-[var(--accent-soft)] px-5 py-6">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="signal-eyebrow">Actionable now</div>
                        <h3 className="mt-2 text-2xl font-semibold tracking-[-0.02em]">{hero.name}</h3>
                        <p className="mt-2 max-w-md text-sm leading-6 text-[var(--text-secondary)]">{hero.note}</p>
                      </div>
                      <div className="text-right">
                        <div className="font-mono text-6xl font-semibold leading-none tracking-[-0.07em]"><CountUp value={hero.count} /></div>
                        <div className="mt-2 text-xs uppercase tracking-[0.14em] text-[var(--text-secondary)]">awaiting review</div>
                      </div>
                    </div>
                  </div>
                ) : null}

                <div className="grid divide-y divide-[var(--border-hairline)] md:grid-cols-2 md:divide-x md:divide-y-0">
                  {supporting.map((object) => (
                    <div className="border-b border-[var(--border-hairline)] p-5 even:md:border-r-0" key={object.name}>
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <h3 className="text-lg font-semibold">{object.name}</h3>
                          <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">{object.note}</p>
                        </div>
                        <div className="font-mono text-3xl font-semibold tracking-[-0.05em]"><CountUp value={object.count} /></div>
                      </div>
                    </div>
                  ))}
                </div>

                {footer ? (
                  <div className="flex items-center justify-between gap-4 border-t border-[var(--border-hairline)] bg-[var(--surface-soft)] px-5 py-4">
                    <div>
                      <div className="text-sm font-semibold">{footer.name}</div>
                      <div className="mt-0.5 text-xs text-[var(--text-secondary)]">{footer.note}</div>
                    </div>
                    <div className="font-mono text-2xl font-semibold tracking-[-0.04em]"><CountUp value={footer.count} /></div>
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
              <div className="grid grid-cols-[minmax(0,1fr)_minmax(112px,148px)] items-center gap-4 border-b border-[var(--border-hairline)] pb-4 last:border-0 last:pb-0" key={item.label}>
                <div>
                  <div className="font-semibold">{item.label}</div>
                  <div className="mt-1 text-sm text-[var(--text-secondary)]">{item.meta}</div>
                </div>
                <div
                  className={`inline-flex min-h-8 w-full items-center justify-between rounded-full border px-3 text-xs font-semibold ${
                    item.value === "Ready"
                      ? "border-[oklch(0.82_0.13_85/0.3)] bg-[oklch(0.82_0.13_85/0.12)] text-[oklch(0.9_0.09_85)]"
                      : "border-[oklch(0.78_0.14_158/0.3)] bg-[oklch(0.78_0.14_158/0.14)] text-[oklch(0.88_0.1_158)]"
                  }`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${item.value === "Ready" ? "bg-[oklch(0.82_0.13_85)]" : "bg-[oklch(0.78_0.14_158)]"}`} aria-hidden="true" />
                  <span>{item.value}</span>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <Panel className="module-rise mt-4 p-0 [animation-delay:150ms]">
        <div className="flex flex-col gap-3 border-b border-[var(--border-hairline)] px-5 py-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-xl font-semibold tracking-[-0.02em]">Automated integrity scanner</h2>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              Searches the CRM model for missing fields, duplicate records, orphaned relationships, and routing blockers.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Link
              className={buttonClasses({ variant: "ghost" })}
              href="/data-foundation?action=configure-scanner"
            >
              Configure rules
            </Link>
            <Link
              className={buttonClasses({ variant: "primary" })}
              href="/data-foundation?action=run-integrity-scan"
            >
              Run scan
            </Link>
          </div>
        </div>

        <div className="grid border-b border-[var(--border-hairline)] md:grid-cols-4">
          {integrityScanStats.map((stat) => (
            <div className="border-b border-[var(--border-hairline)] px-5 py-4 md:border-b-0 md:border-r last:md:border-r-0" key={stat.label}>
              <div className="text-xs text-[var(--text-secondary)]">{stat.label}</div>
              <div className="mt-1.5 font-mono text-2xl font-semibold tracking-[-0.04em]"><CountUp value={stat.value} /></div>
              <div className="mt-2 inline-flex rounded-md border border-[oklch(0.82_0.13_85/0.3)] bg-[oklch(0.82_0.13_85/0.12)] px-2 py-1 text-xs font-semibold text-[oklch(0.9_0.09_85)]">
                {stat.delta}
              </div>
            </div>
          ))}
        </div>

      </Panel>

      <div className="mt-4 grid min-w-0 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Panel className="module-rise p-0 [animation-delay:170ms]">
          <div className="flex flex-col gap-3 border-b border-[var(--border-hairline)] px-5 py-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-xl font-semibold tracking-[-0.02em]">Detected integrity queue</h2>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">Findings generated by scanner rules before automation can trust the record.</p>
            </div>
            <Link
              className={buttonClasses({ variant: "primary" })}
              href="/data-foundation?action=run-integrity-scan"
            >
              Run scan
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] border-separate border-spacing-0 text-left text-sm">
              <thead>
                <tr className="text-xs uppercase tracking-[0.14em] text-[var(--text-muted)]">
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
                    <td className="border-t border-[var(--border-hairline)] px-5 py-4 font-semibold">{row.issue}</td>
                    <td className="border-t border-[var(--border-hairline)] px-4 py-4 text-[var(--text-secondary)]">{row.affected}</td>
                    <td className="border-t border-[var(--border-hairline)] px-4 py-4">{row.detector}</td>
                    <td className="border-t border-[var(--border-hairline)] px-4 py-4">{row.impact}</td>
                    <td className="border-t border-[var(--border-hairline)] px-4 py-4 font-mono">{row.confidence}</td>
                    <td className="border-t border-[var(--border-hairline)] px-4 py-4 text-[var(--text-secondary)]"><LiveTime baseline={row.lastFound} /></td>
                    <td className="border-t border-[var(--border-hairline)] px-5 py-4 text-right">
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
          <div className="mt-5 divide-y divide-[var(--border-hairline)]">
            {validationRows.map((row) => (
              <div className="flex items-center justify-between gap-4 py-4 first:pt-0 last:pb-0" key={row.label}>
                <div>
                  <div className="font-semibold">{row.label}</div>
                  <div className="mt-1 text-sm text-[var(--text-secondary)]">{row.value}</div>
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
    <div className="flex items-center gap-2.5 rounded-md border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-3.5 py-2 shadow-[0_18px_45px_-34px_rgba(52,43,34,0.42)]">
      <span className="h-2 w-2 rounded-full bg-[oklch(0.78_0.14_158)] status-breathe" />
      <div className="text-xs">
        <span className="font-semibold text-[var(--text-primary)]">Data contracts ready</span>
        <span className="ml-2 text-[var(--text-secondary)]">6 objects</span>
      </div>
    </div>
  );
}
