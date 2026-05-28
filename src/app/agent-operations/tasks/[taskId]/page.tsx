import Link from "next/link";
import { notFound } from "next/navigation";

import { AppShell } from "../../../_components/app-shell";
import { PageHeader, Panel, StatusPill } from "../../../_components/page-header";
import { agentApprovalQueue, agentOperations, agentTaskQueue } from "../../../_data/growth-engine";

type AgentTaskDetailPageProps = {
  params: Promise<{ taskId: string }>;
};

export default async function AgentTaskDetailPage({ params }: AgentTaskDetailPageProps) {
  const { taskId } = await params;
  const task = agentTaskQueue.find((item) => item.id.toLowerCase() === taskId.toLowerCase());

  if (!task) notFound();

  const agent = agentOperations.find((item) => item.key === task.agentKey);
  const approval = agentApprovalQueue.find((item) => item.campaign === task.campaign || item.source.includes(task.persona));

  return (
    <AppShell active="/agent-operations">
      <PageHeader
        eyebrow="Agent Task Detail"
        title={`${task.id}: ${task.task}`}
        description={task.objective}
        aside={<StatusPill tone={task.status === "blocked" ? "red" : task.status === "needs_approval" ? "amber" : "blue"}>{task.status.replaceAll("_", " ")}</StatusPill>}
      />

      <div className="grid min-w-0 items-start gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.85fr)]">
        <div className="min-w-0 space-y-4">
          <Panel className="module-rise p-0 [animation-delay:70ms]">
            <div className="grid md:grid-cols-3">
              {[
                ["Agent", agent?.name ?? task.agentKey],
                ["Campaign", task.campaign],
                ["Persona", task.persona],
                ["Priority", task.priority],
                ["Risk", task.risk],
                ["Updated", task.updated],
              ].map(([label, value]) => (
                <div className="border-b border-[#eee8e1] p-5 md:border-r md:[&:nth-child(3n)]:border-r-0" key={label}>
                  <div className="text-xs uppercase tracking-[0.14em] text-[#7a736b]">{label}</div>
                  <div className="mt-2 font-semibold">{value}</div>
                </div>
              ))}
            </div>
          </Panel>

          <Panel className="module-rise p-0 [animation-delay:110ms]">
            <div className="border-b border-[#e7e0d8] px-5 py-4">
              <h2 className="text-xl font-semibold tracking-[-0.02em]">Source records and prompt inputs</h2>
              <p className="mt-1 text-sm text-[#6e6962]">The context this task is allowed to use.</p>
            </div>
            <div className="grid md:grid-cols-[0.8fr_1.2fr]">
              <div className="border-b border-[#eee8e1] p-5 md:border-b-0 md:border-r">
                <div className="text-xs uppercase tracking-[0.14em] text-[#7a736b]">Linked object</div>
                <Link className="mt-3 block text-lg font-semibold text-[#5bb7e8] hover:text-[#d4ecfb]" href={task.linkedHref}>
                  {task.linkedObject}
                </Link>
                <p className="mt-3 text-sm leading-6 text-[#6e6962]">This scaffold only previews the audit trail. No source record is modified.</p>
              </div>
              <div className="p-5">
                <div className="text-xs uppercase tracking-[0.14em] text-[#7a736b]">Inputs</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {task.inputs.map((input) => (
                    <span className="rounded-full border border-[#5bb7e8]/35 px-2.5 py-1 text-xs font-semibold text-[#d4ecfb]" key={input}>
                      {input}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </Panel>

          <Panel className="module-rise p-0 [animation-delay:150ms]">
            <div className="border-b border-[#e7e0d8] px-5 py-4">
              <h2 className="text-xl font-semibold tracking-[-0.02em]">Output draft</h2>
              <p className="mt-1 text-sm text-[#6e6962]">Generated output stays inspectable and locked until approval.</p>
            </div>
            <div className="p-5">
              <div className="text-lg font-semibold">{task.outputTitle}</div>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-[#6e6962]">{task.outputBody}</p>
              <div className="mt-5 rounded-md border border-[#ddd6cd] bg-[#fbfaf8] p-4">
                <div className="text-sm font-semibold">Compliance result</div>
                <p className="mt-2 text-sm leading-6 text-[#6e6962]">{task.compliance}</p>
              </div>
            </div>
          </Panel>
        </div>

        <div className="min-w-0 space-y-4">
          <Panel className="module-rise [animation-delay:130ms]">
            <h2 className="text-xl font-semibold tracking-[-0.02em]">Approval state</h2>
            <div className="mt-4 rounded-md border border-[#ddd6cd] bg-[#fbfaf8] p-4">
              <div className="text-xs uppercase tracking-[0.14em] text-[#7a736b]">Requirement</div>
              <div className="mt-2 font-semibold">{task.approval}</div>
            </div>
            {approval ? (
              <Link
                className="mt-4 inline-flex min-h-11 items-center rounded-md bg-[#151515] px-4 text-sm font-semibold text-white transition hover:bg-[#2a2a2a] active:-translate-y-px"
                href={approval.href}
              >
                Open approval item
              </Link>
            ) : null}
          </Panel>

          <Panel className="module-rise [animation-delay:170ms]">
            <h2 className="text-xl font-semibold tracking-[-0.02em]">Run log</h2>
            <div className="mt-5 divide-y divide-[#eee8e1]">
              {[
                ["Queued", "Task created from scaffold data."],
                ["Input collected", "Source records and guardrails attached."],
                ["Output prepared", "Draft output created for review."],
                ["Approval checked", task.compliance],
              ].map(([label, detail]) => (
                <div className="py-4 first:pt-0 last:pb-0" key={label}>
                  <div className="font-semibold">{label}</div>
                  <p className="mt-1 text-sm leading-5 text-[#6e6962]">{detail}</p>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      </div>
    </AppShell>
  );
}
