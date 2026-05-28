import Link from "next/link";

import { AppShell } from "../_components/app-shell";
import { CountUp } from "../_components/count-up";
import { LiveTime } from "../_components/live-time";
import { ActionFeedback, OperatorBar, PageHeader, Panel, StatusPill } from "../_components/page-header";
import {
  agentApprovalQueue,
  agentOperationMetrics,
  agentOperations,
  agentRecentOutputs,
  agentTaskQueue,
} from "../_data/growth-engine";

type AgentOperationsPageProps = {
  searchParams?: Promise<{ action?: string | string[] }>;
};

const actionMessages: Record<string, string> = {
  "run-preview": "Agent run previewed. No model provider was called and no records were changed.",
  "open-approvals": "Approval queue previewed. Generated drafts remain locked until owner review.",
  "review-blocked": "Blocked output previewed. Off-scope and coverage-risk assets stay unavailable for launch.",
};

export default async function AgentOperationsPage({ searchParams }: AgentOperationsPageProps) {
  const query = searchParams ? await searchParams : {};
  const action = getValue(query.action);
  const blockedCount = agentTaskQueue.filter((task) => task.status === "blocked").length;

  return (
    <AppShell active="/agent-operations">
      <PageHeader
        eyebrow="Agent Operations"
        title="Visible AI work, approvals, and audit trails"
        description="Specialized agents can plan, draft, check, and recommend. Nothing publishes, sends, or changes CRM records without human approval."
        aside={<StatusPill tone="blue">Scaffold only</StatusPill>}
      />

      <ActionFeedback action={action} messages={actionMessages} />

      <OperatorBar
        task="Start with the work that needs a human decision."
        detail="Review approvals first, then check blocked drafts. Agent work stays in preview mode until someone approves the next step."
        status={`${agentApprovalQueue.length} approvals`}
        primary={
          <Link
            className="inline-flex min-h-11 items-center justify-center rounded-md bg-[#151515] px-4 text-sm font-semibold text-white transition hover:bg-[#2a2a2a] active:-translate-y-px"
            href="/approvals"
          >
            Review approvals
          </Link>
        }
        secondary={
          <Link
            className="inline-flex min-h-11 items-center justify-center rounded-md border border-[#ddd6cd] bg-white px-4 text-sm font-semibold transition hover:border-[#151515] active:-translate-y-px"
            href="/agent-operations?action=review-blocked"
          >
            Check blocked
          </Link>
        }
      />

      <Panel className="module-rise p-0 [animation-delay:70ms]">
        <div className="grid divide-y divide-[#eee8e1] md:grid-cols-3 md:divide-x md:divide-y-0 xl:grid-cols-6">
          {agentOperationMetrics.map((metric) => (
            <div className="px-4 py-4" key={metric.label}>
              <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[#7a736b]">{metric.label}</div>
              <div className="mt-2 font-mono text-2xl font-semibold tracking-[-0.04em]"><CountUp value={metric.value} /></div>
              <div className="mt-1.5 text-xs font-semibold text-[#5bb7e8]">{metric.delta}</div>
            </div>
          ))}
        </div>
      </Panel>

      <div className="mt-4 grid min-w-0 items-start gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(360px,0.75fr)]">
        <div className="min-w-0 space-y-4">
          <Panel className="module-rise p-0 [animation-delay:120ms]">
            <div className="border-b border-[#e7e0d8] px-5 py-5">
              <h2 className="text-xl font-semibold tracking-[-0.02em]">Active agents</h2>
              <p className="mt-1 text-sm text-[#6e6962]">The first scaffolded workforce for marketing operations.</p>
            </div>
            <div className="grid md:grid-cols-2">
              {agentOperations.map((agent) => (
                <Link
                  className="border-b border-[#eee8e1] p-5 transition hover:bg-[#fbfaf8] md:border-r even:md:border-r-0 active:-translate-y-px"
                  href={agent.href}
                  key={agent.key}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-lg font-semibold">{agent.name}</div>
                      <p className="mt-2 text-sm leading-6 text-[#6e6962]">{agent.purpose}</p>
                    </div>
                    <StatusPill tone={agent.status === "Required" || agent.status === "Needs approval" ? "amber" : "green"}>
                      {agent.status}
                    </StatusPill>
                  </div>
                  <div className="mt-4 rounded-md border border-[#ddd6cd] bg-[#fbfaf8] p-3">
                    <div className="text-xs uppercase tracking-[0.14em] text-[#7a736b]">Current task</div>
                    <div className="mt-2 text-sm font-semibold leading-6">{agent.currentTask}</div>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {agent.riskFlags.map((flag) => (
                      <span className="rounded-full border border-[#5bb7e8]/35 px-2 py-0.5 text-xs font-semibold text-[#d4ecfb]" key={flag}>
                        {flag}
                      </span>
                    ))}
                  </div>
                </Link>
              ))}
            </div>
          </Panel>

          <Panel className="module-rise p-0 [animation-delay:170ms]">
            <div className="flex flex-col gap-3 border-b border-[#e7e0d8] px-5 py-5 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-xl font-semibold tracking-[-0.02em]">Agent work queue</h2>
                <p className="mt-1 text-sm text-[#6e6962]">Tasks show the source object, risk, approval requirement, and audit trail.</p>
              </div>
              <Link
                className="inline-flex min-h-11 items-center rounded-md border border-[#ddd6cd] bg-white px-4 text-sm font-semibold transition hover:border-[#151515] active:-translate-y-px"
                href="/agent-operations?action=review-blocked"
              >
                Review blocked ({blockedCount})
              </Link>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] border-separate border-spacing-0 text-left text-sm">
                <thead>
                  <tr className="text-xs uppercase tracking-[0.14em] text-[#7a736b]">
                    <th className="px-5 py-4">Task</th>
                    <th className="px-4 py-4">Agent</th>
                    <th className="px-4 py-4">Linked record</th>
                    <th className="px-4 py-4">Risk</th>
                    <th className="px-4 py-4">Approval</th>
                    <th className="px-5 py-4">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {agentTaskQueue.map((task) => (
                    <tr key={task.id}>
                      <td className="border-t border-[#eee8e1] px-5 py-4">
                        <Link className="font-semibold text-[#5bb7e8] hover:text-[#d4ecfb]" href={task.href}>
                          {task.task}
                        </Link>
                        <div className="mt-1 font-mono text-xs text-[#6e6962]">{task.id} / <LiveTime baseline={task.updated} /></div>
                      </td>
                      <td className="border-t border-[#eee8e1] px-4 py-4">{findAgent(task.agentKey)?.name ?? task.agentKey}</td>
                      <td className="border-t border-[#eee8e1] px-4 py-4">
                        <Link className="font-semibold text-[#5bb7e8] hover:text-[#d4ecfb]" href={task.linkedHref}>
                          {task.linkedObject}
                        </Link>
                      </td>
                      <td className="border-t border-[#eee8e1] px-4 py-4">{task.risk}</td>
                      <td className="border-t border-[#eee8e1] px-4 py-4 text-[#6e6962]">{task.approval}</td>
                      <td className="border-t border-[#eee8e1] px-5 py-4">
                        <StatusPill tone={statusTone(task.status)}>{task.status.replaceAll("_", " ")}</StatusPill>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>

        <div className="min-w-0 space-y-4">
          <Panel className="module-rise [animation-delay:145ms]">
            <h2 className="text-xl font-semibold tracking-[-0.02em]">Approval required</h2>
            <div className="mt-5 divide-y divide-[#eee8e1]">
              {agentApprovalQueue.slice(0, 3).map((item) => (
                <Link className="block py-4 first:pt-0 last:pb-0 active:-translate-y-px" href={item.href} key={item.id}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold">{item.source}</div>
                      <div className="mt-1 text-sm text-[#6e6962]">{item.campaign}</div>
                    </div>
                    <StatusPill tone={item.status === "Blocked" ? "red" : item.status === "Needs compliance" ? "amber" : "green"}>
                      {item.status}
                    </StatusPill>
                  </div>
                  <div className="mt-2 text-xs text-[#7a736b]">Risk: {item.risk} / Channel: {item.channel}</div>
                </Link>
              ))}
            </div>
            <Link
              className="mt-5 inline-flex min-h-11 items-center rounded-md bg-[#151515] px-4 text-sm font-semibold text-white transition hover:bg-[#2a2a2a] active:-translate-y-px"
              href="/approvals"
            >
              Review all approvals
            </Link>
          </Panel>

          <Panel className="module-rise [animation-delay:190ms]">
            <h2 className="text-xl font-semibold tracking-[-0.02em]">Recent outputs</h2>
            <div className="mt-5 divide-y divide-[#eee8e1]">
              {agentRecentOutputs.map((output) => (
                <div className="py-4 first:pt-0 last:pb-0" key={output.output}>
                  <div className="font-semibold">{output.output}</div>
                  <div className="mt-1 text-sm text-[#6e6962]">{output.agent}</div>
                  <div className="mt-2 flex items-center justify-between gap-3">
                    <span className="text-xs text-[#7a736b]"><LiveTime baseline={output.time} /></span>
                    <span className="rounded-full border border-[#5bb7e8]/35 px-2 py-0.5 text-xs font-semibold text-[#d4ecfb]">
                      {output.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </Panel>

          <Panel className="module-rise [animation-delay:220ms]">
            <h2 className="text-xl font-semibold tracking-[-0.02em]">Agent safety</h2>
            <div className="mt-4 grid gap-2 text-sm">
              {[
                "No publishing without approval",
                "No SMS or email dispatch",
                "No coverage, claim approval, or payout promises",
                "No hail-only or exterior-roof campaign generation",
              ].map((rule) => (
                <div className="rounded-md border border-[#ddd6cd] bg-[#fbfaf8] px-3 py-2 font-semibold" key={rule}>
                  {rule}
                </div>
              ))}
            </div>
          </Panel>
        </div>
      </div>
    </AppShell>
  );
}

function getValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function findAgent(agentKey: string) {
  return agentOperations.find((agent) => agent.key === agentKey);
}

function statusTone(status: string): "amber" | "green" | "red" | "blue" {
  if (status === "blocked") return "red";
  if (status === "needs_approval") return "amber";
  if (status === "running") return "blue";
  return "green";
}
