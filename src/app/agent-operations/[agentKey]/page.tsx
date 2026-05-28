import Link from "next/link";
import { notFound } from "next/navigation";

import { AppShell } from "../../_components/app-shell";
import { PageHeader, Panel, StatusPill } from "../../_components/page-header";
import { agentApprovalQueue, agentOperations, agentTaskQueue } from "../../_data/growth-engine";

type AgentDetailPageProps = {
  params: Promise<{ agentKey: string }>;
};

export default async function AgentDetailPage({ params }: AgentDetailPageProps) {
  const { agentKey } = await params;
  const agent = agentOperations.find((item) => item.key === agentKey);

  if (!agent) notFound();

  const tasks = agentTaskQueue.filter((task) => task.agentKey === agent.key);
  const approvals = agentApprovalQueue.filter((item) => item.agentKey === agent.key);

  return (
    <AppShell active="/agent-operations">
      <PageHeader
        eyebrow="Agent Detail"
        title={agent.name}
        description={agent.purpose}
        aside={<StatusPill tone={agent.status === "Required" || agent.status === "Needs approval" ? "amber" : "green"}>{agent.status}</StatusPill>}
      />

      <div className="grid min-w-0 items-start gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.85fr)]">
        <div className="min-w-0 space-y-4">
          <Panel className="module-rise p-0 [animation-delay:70ms]">
            <div className="border-b border-[#e7e0d8] px-5 py-5">
              <h2 className="text-xl font-semibold tracking-[-0.02em]">Current configuration</h2>
              <p className="mt-1 text-sm text-[#6e6962]">Scaffold-only instruction profile, permissions, and active work.</p>
            </div>
            <div className="grid md:grid-cols-2">
              <div className="border-b border-[#eee8e1] p-5 md:border-b-0 md:border-r">
                <div className="text-xs uppercase tracking-[0.14em] text-[#7a736b]">Current task</div>
                <div className="mt-3 text-lg font-semibold">{agent.currentTask}</div>
                <p className="mt-3 text-sm leading-6 text-[#6e6962]">{agent.lastOutput}</p>
              </div>
              <div className="p-5">
                <div className="text-xs uppercase tracking-[0.14em] text-[#7a736b]">Instruction profile</div>
                <p className="mt-3 text-sm leading-6 text-[#6e6962]">{agent.instructionProfile}</p>
                <div className="mt-4 rounded-md border border-[#ddd6cd] bg-[#fbfaf8] p-3 text-sm font-semibold">
                  Approval policy: {agent.approvalPolicy}
                </div>
              </div>
            </div>
          </Panel>

          <Panel className="module-rise p-0 [animation-delay:110ms]">
            <div className="border-b border-[#e7e0d8] px-5 py-4">
              <h2 className="text-xl font-semibold tracking-[-0.02em]">Task history</h2>
              <p className="mt-1 text-sm text-[#6e6962]">Each task opens into a full audit trail.</p>
            </div>
            <div className="divide-y divide-[#eee8e1]">
              {tasks.map((task) => (
                <Link className="grid gap-3 px-5 py-4 transition hover:bg-[#fbfaf8] md:grid-cols-[1fr_auto] active:-translate-y-px" href={task.href} key={task.id}>
                  <div>
                    <div className="font-semibold">{task.task}</div>
                    <div className="mt-1 text-sm text-[#6e6962]">{task.objective}</div>
                    <div className="mt-2 font-mono text-xs text-[#7a736b]">{task.id} / {task.linkedObject}</div>
                  </div>
                  <StatusPill tone={task.status === "blocked" ? "red" : task.status === "needs_approval" ? "amber" : "green"}>
                    {task.status.replaceAll("_", " ")}
                  </StatusPill>
                </Link>
              ))}
              {tasks.length === 0 ? (
                <div className="px-5 py-6 text-sm text-[#6e6962]">No scaffold tasks are assigned yet.</div>
              ) : null}
            </div>
          </Panel>
        </div>

        <div className="min-w-0 space-y-4">
          <Panel className="module-rise [animation-delay:130ms]">
            <h2 className="text-xl font-semibold tracking-[-0.02em]">Permissions</h2>
            <div className="mt-5 grid gap-4">
              <div>
                <div className="text-xs uppercase tracking-[0.14em] text-[#7a736b]">Allowed actions</div>
                <div className="mt-3 space-y-2">
                  {agent.allowedActions.map((action) => (
                    <div className="rounded-md border border-[#ddd6cd] bg-[#fbfaf8] px-3 py-2 text-sm font-semibold" key={action}>
                      {action}
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-[0.14em] text-[#7a736b]">Blocked actions</div>
                <div className="mt-3 space-y-2">
                  {agent.blockedActions.map((action) => (
                    <div className="rounded-md border border-[#f1cdc8] bg-[#fff5f3] px-3 py-2 text-sm font-semibold text-[#bd2b23]" key={action}>
                      {action}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Panel>

          <Panel className="module-rise [animation-delay:170ms]">
            <h2 className="text-xl font-semibold tracking-[-0.02em]">Data sources</h2>
            <div className="mt-4 flex flex-wrap gap-2">
              {agent.dataSources.map((source) => (
                <span className="rounded-full border border-[#5bb7e8]/35 px-2.5 py-1 text-xs font-semibold text-[#d4ecfb]" key={source}>
                  {source}
                </span>
              ))}
            </div>
          </Panel>

          <Panel className="module-rise [animation-delay:210ms]">
            <h2 className="text-xl font-semibold tracking-[-0.02em]">Approval items</h2>
            <div className="mt-5 divide-y divide-[#eee8e1]">
              {approvals.map((item) => (
                <Link className="block py-4 first:pt-0 last:pb-0 active:-translate-y-px" href={item.href} key={item.id}>
                  <div className="font-semibold">{item.source}</div>
                  <div className="mt-1 text-sm text-[#6e6962]">{item.campaign}</div>
                  <div className="mt-2 text-xs text-[#7a736b]">Risk: {item.risk}</div>
                </Link>
              ))}
              {approvals.length === 0 ? (
                <div className="text-sm text-[#6e6962]">No approval items are attached to this agent yet.</div>
              ) : null}
            </div>
          </Panel>
        </div>
      </div>
    </AppShell>
  );
}
