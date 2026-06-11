import Link from "next/link";
import { connection } from "next/server";

import { IntelligencePanel } from "../_components/intelligence-panel";
import { EmptyState, PageHeader, StatusPill, buttonClasses } from "../_components/page-header";
import { MetricStrip, WorkspacePanel } from "../_components/workspace";
import { getAgentOperationsDashboard } from "@/lib/agent-operations/read-model";

import { BoardViewSwitch } from "./board-view-switch";

export default async function AgentOperationsPage() {
  await connection();

  const dashboard = await getAgentOperationsDashboard();

  if (dashboard.status === "unavailable") {
    return (
      <>
        <Header status="Unavailable" />
        <EmptyState title="Mark operations unavailable" detail={dashboard.message} />
      </>
    );
  }

  const runner = dashboard.markRunner;
  const activeTask = dashboard.tasks[0] ?? null;
  const blockedTasks = dashboard.tasks.filter((task) => /blocked/i.test(task.status));

  return (
    <>
      <Header status={runner.status} />

      <MetricStrip
        metrics={dashboard.metrics.slice(0, 4).map((metric, index) => ({
          label: metric.label,
          value: metric.value,
          detail: metric.delta,
          tone: index === 1 || index === 2 ? ("amber" as const) : ("blue" as const),
        }))}
      />

      <div className="grid min-w-0 gap-5 2xl:grid-cols-[minmax(0,1fr)_430px]">
        <div className="min-w-0 space-y-5">
          <WorkspacePanel
            className="p-0"
            eyebrow="Task queue"
            title="Queued, running, blocked, and completed work"
            description="Mark can prepare drafts, enrich records, classify, score, and create approval packets. External action remains disabled."
            aside={<StatusPill tone={dashboard.tasks.length > 0 ? "blue" : "gray"}>{dashboard.tasks.length} tasks</StatusPill>}
          >
            <BoardViewSwitch tasks={dashboard.tasks} />
          </WorkspacePanel>

          <WorkspacePanel
            eyebrow="Recent outputs"
            title="What Mark wrote back"
            description="Outputs are internal records. They need approval before any outbound-facing use."
          >
            {dashboard.recentOutputs.length > 0 ? (
              <div className="divide-y divide-[var(--border-hairline)]">
                {dashboard.recentOutputs.map((output) => (
                  <div className="grid gap-3 px-5 py-4 sm:grid-cols-[minmax(0,1fr)_120px]" key={`${output.output}-${output.time}`}>
                    <div className="min-w-0">
                      <div className="truncate font-bold text-[var(--text-primary)]">{output.output}</div>
                      <div className="mt-1 text-sm text-[var(--text-secondary)]">{output.agent} / {output.time}</div>
                    </div>
                    <StatusPill tone={statusTone(output.status)}>{output.status}</StatusPill>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState title="No outputs yet" detail="Completed Mark outputs will appear here with approval state and audit trace." />
            )}
          </WorkspacePanel>
        </div>

        <aside className="min-w-0 space-y-5 2xl:sticky 2xl:top-5 2xl:self-start">
          <IntelligencePanel
            model={{
              title: activeTask?.task ?? "Mark runner",
              persona: activeTask?.linkedObject ?? "Growth operations",
              confidence: runner.configured ? "Configured" : "Needs runner config",
              journeyStage: activeTask?.status ?? runner.status,
              urgency: blockedTasks.length > 0 ? "Blocked task needs human input" : runner.queuedTasks > 0 ? "Queued work" : "Monitoring",
              attentionReason: activeTask?.objective ?? runner.nextStep,
              nextBestAction: blockedTasks.length > 0 ? "Open the blocked task, inspect logs, and repair inputs before retrying." : runner.nextStep,
              cta: "Mark prepares only. Humans approve campaign, contact, publish, and spend decisions.",
              messageAngle: runner.mode,
              guardrailStatus: runner.killSwitch || "Outbound locked",
              scores: [
                { label: "Queued", value: runner.queuedTasks, detail: "Waiting tasks", tone: runner.queuedTasks > 0 ? "amber" : "gray" },
                { label: "Running", value: runner.runningTasks, detail: "Active tasks", tone: runner.runningTasks > 0 ? "blue" : "gray" },
                { label: "Blocked", value: runner.blockedTasks, detail: "Needs repair", tone: runner.blockedTasks > 0 ? "red" : "green" },
              ],
              proofPoints: [
                `Runner: ${runner.runner}`,
                `Heartbeat: ${runner.lastHeartbeat ?? "No heartbeat yet"}`,
                `Approval tasks: ${runner.approvalTasks}`,
              ],
              outboundLocked: true,
            }}
          />

          <WorkspacePanel eyebrow="Awaiting approval" title="Human gate">
            {dashboard.approvals.length > 0 ? (
              <div className="divide-y divide-[var(--border-hairline)]">
                {dashboard.approvals.map((approval) => (
                  <Link className="block px-5 py-4 transition hover:bg-[var(--surface-inset)]" href={approval.href} key={approval.id}>
                    <div className="font-bold text-[var(--text-primary)]">{approval.campaign}</div>
                    <div className="mt-1 text-sm text-[var(--text-secondary)]">{approval.channel} / {approval.risk} risk</div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="p-4">
                <EmptyState title="No approval blockers" detail="Mark has no active approval items attached to the current dashboard slice." />
              </div>
            )}
          </WorkspacePanel>

          <Link className={buttonClasses({ variant: "primary", className: "w-full" })} href="/campaigns">
            Open campaign packages
          </Link>
        </aside>
      </div>
    </>
  );
}

function Header({ status }: { status: string }) {
  return (
    <PageHeader
      eyebrow="Mark operations"
      title="Task queue, audit trail, and safe repair controls."
      description="Use this page to see what Mark is doing, what data he touched, what outputs he created, and what needs approval or repair."
      aside={
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill tone={statusTone(status)}>{status}</StatusPill>
          <StatusPill tone="amber">No outbound execution</StatusPill>
        </div>
      }
    />
  );
}

function statusTone(status: string) {
  if (/complete|active|approved|ready|configured/i.test(status)) return "green";
  if (/blocked|error|failed/i.test(status)) return "red";
  if (/queued|running|approval|pending|review/i.test(status)) return "amber";
  return "blue";
}
