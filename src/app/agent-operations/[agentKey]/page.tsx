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
            <div className="border-b border-[var(--border-hairline)] px-5 py-5">
              <h2 className="text-xl font-semibold tracking-[-0.02em]">Current configuration</h2>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">Instruction profile, permissions, and active work.</p>
            </div>
            <div className="grid md:grid-cols-2">
              <div className="border-b border-[var(--border-hairline)] p-5 md:border-b-0 md:border-r">
                <div className="text-xs uppercase tracking-[0.14em] text-[var(--text-muted)]">Current task</div>
                <div className="mt-3 text-lg font-semibold">{agent.currentTask}</div>
                <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">{agent.lastOutput}</p>
              </div>
              <div className="p-5">
                <div className="text-xs uppercase tracking-[0.14em] text-[var(--text-muted)]">Instruction profile</div>
                <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">{agent.instructionProfile}</p>
                <div className="mt-4 rounded-md border border-[var(--border-hairline)] bg-[var(--surface-soft)] p-3 text-sm font-semibold">
                  Approval policy: {agent.approvalPolicy}
                </div>
              </div>
            </div>
          </Panel>

          <Panel className="module-rise p-0 [animation-delay:110ms]">
            <div className="border-b border-[var(--border-hairline)] px-5 py-4">
              <h2 className="text-xl font-semibold tracking-[-0.02em]">Task history</h2>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">Each task opens into a full audit trail.</p>
            </div>
            <div className="divide-y divide-[var(--border-hairline)]">
              {tasks.map((task) => (
                <Link className="grid gap-3 px-5 py-4 transition hover:bg-[var(--surface-inset)] md:grid-cols-[1fr_auto] active:-translate-y-px" href={task.href} key={task.id}>
                  <div>
                    <div className="font-semibold">{task.task}</div>
                    <div className="mt-1 text-sm text-[var(--text-secondary)]">{task.objective}</div>
                    <div className="mt-2 font-mono text-xs text-[var(--text-muted)]">{task.id} / {task.linkedObject}</div>
                  </div>
                  <StatusPill tone={task.status === "blocked" ? "red" : task.status === "needs_approval" ? "amber" : "green"}>
                    {task.status.replaceAll("_", " ")}
                  </StatusPill>
                </Link>
              ))}
              {tasks.length === 0 ? (
                <div className="px-5 py-6 text-sm text-[var(--text-secondary)]">No live tasks are assigned yet.</div>
              ) : null}
            </div>
          </Panel>
        </div>

        <div className="min-w-0 space-y-4">
          <Panel className="module-rise [animation-delay:130ms]">
            <h2 className="text-xl font-semibold tracking-[-0.02em]">Permissions</h2>
            <div className="mt-5 grid gap-4">
              <div>
                <div className="text-xs uppercase tracking-[0.14em] text-[var(--text-muted)]">Allowed actions</div>
                <div className="mt-3 space-y-2">
                  {agent.allowedActions.map((action) => (
                    <div className="rounded-md border border-[var(--border-hairline)] bg-[var(--surface-soft)] px-3 py-2 text-sm font-semibold" key={action}>
                      {action}
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-[0.14em] text-[var(--text-muted)]">Blocked actions</div>
                <div className="mt-3 space-y-2">
                  {agent.blockedActions.map((action) => (
                    <div className="rounded-md border border-[oklch(0.68_0.2_26/0.42)] bg-[oklch(0.68_0.2_26/0.16)] px-3 py-2 text-sm font-semibold text-[oklch(0.86_0.09_26)]" key={action}>
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
                <span className="rounded-full border border-[var(--border-hairline)] px-2.5 py-1 text-xs font-semibold text-[var(--accent)]" key={source}>
                  {source}
                </span>
              ))}
            </div>
          </Panel>

          <Panel className="module-rise [animation-delay:210ms]">
            <h2 className="text-xl font-semibold tracking-[-0.02em]">Approval items</h2>
            <div className="mt-5 divide-y divide-[var(--border-hairline)]">
              {approvals.map((item) => (
                <Link className="block py-4 first:pt-0 last:pb-0 active:-translate-y-px" href={item.href} key={item.id}>
                  <div className="font-semibold">{item.source}</div>
                  <div className="mt-1 text-sm text-[var(--text-secondary)]">{item.campaign}</div>
                  <div className="mt-2 text-xs text-[var(--text-muted)]">Risk: {item.risk}</div>
                </Link>
              ))}
              {approvals.length === 0 ? (
                <div className="text-sm text-[var(--text-secondary)]">No approval items are attached to this agent yet.</div>
              ) : null}
            </div>
          </Panel>
        </div>
      </div>
    </AppShell>
  );
}
