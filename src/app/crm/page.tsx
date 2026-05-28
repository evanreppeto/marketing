import Link from "next/link";

import { AppShell } from "../_components/app-shell";
import { Panel, StatusPill } from "../_components/page-header";
import {
  crmActivityFeed,
  crmPipelineRows,
  crmTaskQueue,
  crmWorkspaceStats,
} from "../_data/growth-engine";
import { CrmCommandHeader } from "./_components/crm-command-header";

export default function CrmOverviewPage() {
  const selectedRecord = crmPipelineRows[0];

  return (
    <AppShell active="/crm">
      <CrmCommandHeader />
      <section className="module-rise mt-4 overflow-hidden rounded-md border border-[#d8dfe8] bg-[#f8fbff] shadow-[0_22px_60px_-44px_rgba(21,35,51,0.42)]">
        <div className="grid gap-3 border-b border-[#d8dfe8] bg-[#f3f7fc] p-4 md:grid-cols-4">
          {crmWorkspaceStats.map((stat) => (
            <div className="rounded-md border border-[#d8dfe8] bg-white p-4" key={stat.label}>
              <div className="text-xs font-medium text-[#63758a]">{stat.label}</div>
              <div className="mt-2 font-mono text-2xl font-semibold tracking-[-0.05em] text-[#0f1720]">
                {stat.value}
              </div>
              <div className="mt-2 text-xs font-semibold text-[#1769aa]">{stat.delta}</div>
            </div>
          ))}
        </div>
      </section>

      <div className="mt-4 grid min-w-0 items-start gap-4 2xl:grid-cols-[minmax(0,1fr)_390px]">
        <Panel className="module-rise overflow-hidden border-[#d8dfe8] p-0 [animation-delay:80ms]">
          <div className="flex flex-col gap-3 border-b border-[#e1e7ef] bg-white px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-xl font-semibold tracking-[-0.02em] text-[#0f1720]">Active CRM list view</h2>
              <p className="mt-1 text-sm text-[#63758a]">
                Shared queue across leads, accounts, properties, jobs, and revenue records.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {["My open work", "Water losses", "Partners", "Due today"].map((view, index) => (
                <Link
                  className={`inline-flex min-h-9 items-center rounded-md border px-3 text-sm font-semibold transition active:-translate-y-px ${
                    index === 0
                      ? "border-[#1769aa] bg-[#eaf4ff] text-[#1769aa]"
                      : "border-[#d8dfe8] bg-white text-[#35506c] hover:border-[#9aabbc]"
                  }`}
                  href={`/crm?view=${view.toLowerCase().replaceAll(" ", "-")}`}
                  key={view}
                >
                  {view}
                </Link>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] border-separate border-spacing-0 text-left text-sm">
              <thead>
                <tr className="bg-[#f6f8fb] text-[11px] uppercase tracking-[0.16em] text-[#63758a]">
                  <th className="w-10 px-5 py-3">
                    <span className="sr-only">Select</span>
                  </th>
                  <th className="px-3 py-3">Record</th>
                  <th className="px-3 py-3">Account / contact</th>
                  <th className="px-3 py-3">Stage</th>
                  <th className="px-3 py-3">Owner</th>
                  <th className="px-3 py-3">Value</th>
                  <th className="px-3 py-3">Next step</th>
                </tr>
              </thead>
              <tbody>
                {crmPipelineRows.map((row) => (
                  <tr className="group transition hover:bg-[#f8fbff]" key={row.id}>
                    <td className="border-t border-[#e1e7ef] px-5 py-4">
                      <span className="block h-4 w-4 rounded border border-[#bdc9d7] bg-white group-hover:border-[#1769aa]" />
                    </td>
                    <td className="border-t border-[#e1e7ef] px-3 py-4">
                      <Link className="font-semibold text-[#0f1720] transition hover:text-[#1769aa]" href={row.href}>
                        {row.record}
                      </Link>
                      <div className="mt-1 text-xs text-[#63758a]">{row.type}</div>
                    </td>
                    <td className="border-t border-[#e1e7ef] px-3 py-4 font-medium text-[#35506c]">{row.account}</td>
                    <td className="border-t border-[#e1e7ef] px-3 py-4">
                      <StatusPill tone={row.tone}>{row.stage}</StatusPill>
                    </td>
                    <td className="border-t border-[#e1e7ef] px-3 py-4 text-[#35506c]">{row.owner}</td>
                    <td className="border-t border-[#e1e7ef] px-3 py-4 font-mono font-semibold text-[#0f1720]">
                      {row.value}
                    </td>
                    <td className="border-t border-[#e1e7ef] px-3 py-4 text-[#35506c]">
                      <div className="font-medium">{row.nextStep}</div>
                      <div className="mt-1 text-xs text-[#63758a]">{row.updated}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <aside className="min-w-0 space-y-4">
          <Panel className="module-rise border-[#d8dfe8] [animation-delay:120ms]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold tracking-[-0.02em] text-[#0f1720]">Record preview</h2>
                <p className="mt-1 text-sm text-[#63758a]">Pinned from the active list view.</p>
              </div>
              <StatusPill tone="green">High fit</StatusPill>
            </div>
            <div className="mt-5 rounded-md border border-[#c7d8e8] bg-[#eaf4ff] p-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#1769aa]">Selected lead</div>
              <div className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-[#0f1720]">
                {selectedRecord.record}
              </div>
              <div className="mt-2 text-sm leading-6 text-[#35506c]">
                {selectedRecord.account} is ready for {selectedRecord.stage.toLowerCase()}.
              </div>
            </div>
            <div className="mt-4 grid grid-cols-3 divide-x divide-[#e1e7ef] rounded-md border border-[#e1e7ef] bg-white text-center">
              {[
                ["Score", selectedRecord.score],
                ["Value", selectedRecord.value],
                ["Owner", selectedRecord.owner],
              ].map(([label, value]) => (
                <div className="p-3" key={label}>
                  <div className="text-xs text-[#63758a]">{label}</div>
                  <div className="mt-1 font-mono text-sm font-semibold text-[#0f1720]">{value}</div>
                </div>
              ))}
            </div>
            <Link
              className="mt-4 inline-flex min-h-10 w-full items-center justify-center rounded-md bg-[#1769aa] px-4 text-sm font-semibold text-white transition hover:bg-[#12598f] active:-translate-y-px"
              href={selectedRecord.href}
            >
              Open full record
            </Link>
          </Panel>

          <Panel className="module-rise border-[#d8dfe8] [animation-delay:170ms]">
            <h2 className="text-xl font-semibold tracking-[-0.02em] text-[#0f1720]">Activity timeline</h2>
            <div className="mt-5 space-y-4">
              {crmActivityFeed.map((activity) => (
                <div className="grid grid-cols-[14px_1fr] gap-3" key={activity.title}>
                  <span className={`mt-1 h-2.5 w-2.5 rounded-full ${activityDot(activity.tone)}`} />
                  <div className="border-b border-[#e1e7ef] pb-4 last:border-0 last:pb-0">
                    <div className="flex items-center justify-between gap-3">
                      <div className="font-semibold text-[#0f1720]">{activity.title}</div>
                      <div className="shrink-0 text-xs text-[#63758a]">{activity.time}</div>
                    </div>
                    <p className="mt-1 text-sm leading-5 text-[#63758a]">{activity.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </Panel>

          <Panel className="module-rise border-[#d8dfe8] [animation-delay:220ms]">
            <h2 className="text-xl font-semibold tracking-[-0.02em] text-[#0f1720]">Tasks due</h2>
            <div className="mt-5 space-y-3">
              {crmTaskQueue.map((task) => (
                <div className="rounded-md border border-[#e1e7ef] bg-[#f8fbff] p-3" key={task.task}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="font-semibold text-[#0f1720]">{task.task}</div>
                    <StatusPill tone={task.priority === "High" ? "red" : task.priority === "Medium" ? "amber" : "gray"}>
                      {task.priority}
                    </StatusPill>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-[#63758a]">
                    <span>{task.object}</span>
                    <span>{task.owner}</span>
                    <span>{task.due}</span>
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        </aside>
      </div>
    </AppShell>
  );
}

function activityDot(tone: string) {
  if (tone === "green") return "bg-[#23a455]";
  if (tone === "blue") return "bg-[#1769aa]";
  if (tone === "red") return "bg-[#d52f28]";
  return "bg-[#c98a16]";
}
