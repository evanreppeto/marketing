import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import { DataTable } from "@/app/_components/data-table";
import { IntelligencePanel } from "@/app/_components/intelligence-panel";
import { EmptyState, PageHeader, StatusPill, buttonClasses } from "@/app/_components/page-header";
import { WorkspacePanel } from "@/app/_components/workspace";
import { getAgentName } from "@/lib/settings/agent-name";
import { getAgentOperationsDashboard } from "@/lib/agent-operations/read-model";

type PageProps = {
  params: Promise<{ agentKey: string }>;
};

export default async function Page({ params }: PageProps) {
  await connection();

  const { agentKey } = await params;
  const agentName = await getAgentName();
  const dashboard = await getAgentOperationsDashboard();

  if (dashboard.status === "unavailable") {
    return (
      <>
        <PageHeader eyebrow="Agent operations" title="Agent unavailable" description={dashboard.message} />
        <EmptyState title="Could not load agent" detail="The agent registry or task queue is unavailable." />
      </>
    );
  }

  const agent = dashboard.agents.find((item) => item.key === agentKey);
  if (!agent) {
    notFound();
  }

  const tasks = dashboard.tasks.filter((task) => task.agentKey === agent.key);
  const approvals = dashboard.approvals.filter((approval) => tasks.some((task) => task.approvalHref === approval.href));

  return (
    <>
      <PageHeader
        eyebrow="Agent detail"
        title={agent.name}
        description={agent.purpose}
        aside={
          <div className="flex flex-wrap gap-2">
            <StatusPill tone={statusTone(agent.status)}>{agent.status}</StatusPill>
            <StatusPill tone="amber">Outbound locked</StatusPill>
          </div>
        }
      />

      <div className="grid min-w-0 items-start gap-5 2xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="min-w-0 space-y-5">
          <WorkspacePanel
            className="p-0"
            eyebrow="Agent queue"
            title={`${agent.name} tasks`}
            description="Agent-specific work queue. Outputs are internal until the approval queue authorizes the next step."
            aside={<StatusPill tone={tasks.length > 0 ? "blue" : "gray"}>{tasks.length} tasks</StatusPill>}
          >
            <DataTable
              rows={tasks}
              rowKey={(row) => row.fullId}
              rowHref={(row) => row.href}
              minWidth="min-w-[920px]"
              columns={[
                {
                  key: "objective",
                  header: "Objective",
                  cell: (row) => (
                    <>
                      <div className="font-bold text-[var(--text-primary)] transition group-hover:text-[var(--accent)]">{row.task}</div>
                      <div className="mt-1 line-clamp-2 text-xs text-[var(--text-muted)]">{row.objective}</div>
                    </>
                  ),
                },
                { key: "status", header: "Status", cell: (row) => <StatusPill tone={statusTone(row.status)}>{row.status}</StatusPill> },
                { key: "risk", header: "Risk", cell: (row) => <StatusPill tone={riskTone(row.risk)}>{row.risk}</StatusPill> },
                {
                  key: "linked",
                  header: "Linked work",
                  cell: (row) => <span className="text-sm font-semibold text-[var(--accent)]">{row.linkedObject}</span>,
                },
                { key: "updated", header: "Updated", cellClassName: "text-[var(--text-secondary)]", cell: (row) => row.updated },
              ]}
              emptyState={<EmptyState title="No tasks for this agent" detail="When tasks are assigned here, they will appear with linked records, risk, and approval state." />}
            />
          </WorkspacePanel>

          <WorkspacePanel eyebrow="Risk flags" title="Operating rules">
            <div className="grid gap-3 p-4 sm:grid-cols-2">
              {agent.riskFlags.map((flag) => (
                <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-3 py-2 text-sm font-semibold text-[var(--text-secondary)]" key={flag}>
                  {flag}
                </div>
              ))}
            </div>
          </WorkspacePanel>
        </div>

        <aside className="min-w-0 space-y-5 2xl:sticky 2xl:top-5 2xl:self-start">
          <IntelligencePanel
            model={{
              title: `${agent.name} operating context`,
              persona: "Growth operations",
              confidence: tasks.length > 0 ? "Tasks linked" : "No active tasks",
              journeyStage: agent.status,
              urgency: tasks.some((task) => /blocked|failed/i.test(task.status)) ? "Blocked work" : "Monitoring",
              attentionReason: agent.currentTask,
              nextBestAction: tasks[0] ? "Open the current task and review logs, outputs, and approval links." : `Queue a scoped ${agentName} task from the operations page.`,
              cta: `${agentName} prepares. Humans approve before contact, send, publish, launch, or spend.`,
              messageAngle: "Evidence-backed campaign and CRM preparation with an explicit human gate.",
              guardrailStatus: "Outbound locked by default.",
              scores: [
                { label: "Tasks", value: tasks.length, detail: "Assigned tasks", tone: tasks.length > 0 ? "blue" : "gray" },
                { label: "Approvals", value: approvals.length, detail: "Linked human gates", tone: approvals.length > 0 ? "amber" : "gray" },
              ],
              proofPoints: agent.riskFlags,
              outboundLocked: true,
            }}
          />

          <Link className={buttonClasses({ variant: "primary", className: "w-full" })} href="/agent-operations">
            Back to {agentName} operations
          </Link>
        </aside>
      </div>
    </>
  );
}

function statusTone(status: string) {
  if (/complete|active|approved|ready|configured/i.test(status)) return "green";
  if (/blocked|error|failed/i.test(status)) return "red";
  if (/queued|running|approval|pending|review/i.test(status)) return "amber";
  return "blue";
}

function riskTone(risk: string) {
  if (/blocked|high/i.test(risk)) return "red";
  if (/medium|warning/i.test(risk)) return "amber";
  return "green";
}
