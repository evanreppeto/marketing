import Link from "next/link";
import { connection } from "next/server";

import { AppShell } from "../_components/app-shell";
import { ActionFeedback, EmptyState, StatusPill } from "../_components/page-header";
import { DetailStack, MetricStrip, WorkspaceHeader, WorkspacePanel } from "../_components/workspace";
import { createMarkTaskAction } from "./actions";
import { getAgentOperationsDashboard } from "@/lib/agent-operations/read-model";

type AgentOperationsPageProps = {
  searchParams?: Promise<{ action?: string | string[]; approval?: string | string[]; task?: string | string[] }>;
};

const actionMessages: Record<string, string> = {
  "mark-task-created": "Mark task queued. The Mac mini runner can pick this up when it is connected.",
  "mark-task-error": "Mark task could not be queued because the task template was not recognized.",
  "not-configured": "Supabase admin env vars are not connected, so this action was skipped. No records were changed.",
};

const taskTemplates = [
  ["find_plumbing_partners", "Find plumbing partners", "Discover and score partner candidates before human approval."],
  ["draft_property_manager_campaign", "Draft property manager campaign", "Create campaign brief and reviewable copy assets."],
  ["refresh_persona_snapshot", "Refresh persona intelligence", "Update persona memory and next-best-action signals."],
];

export default async function AgentOperationsPage({ searchParams }: AgentOperationsPageProps) {
  await connection();

  const query = searchParams ? await searchParams : {};
  const action = getValue(query.action);
  const approvalId = getValue(query.approval);
  const taskId = getValue(query.task);
  const dashboard = await getAgentOperationsDashboard();
  const isLive = dashboard.status === "live";
  const tasks = isLive ? dashboard.tasks : [];
  const approvals = isLive ? dashboard.approvals : [];
  const outputs = isLive ? dashboard.recentOutputs : [];
  const agents = isLive ? dashboard.agents : [];
  const markRunner = isLive ? dashboard.markRunner : null;

  return (
    <AppShell active="/agent-operations">
      <WorkspaceHeader
        eyebrow="Mark operations"
        title="Queue work. Watch the run. Approve the output."
        description="Mark is the marketing agent layer. He can prepare leads, campaigns, scoring, and approval packets, but outbound stays locked."
        status={isLive ? markRunner?.status ?? "Live" : "Unavailable"}
        statusTone={isLive ? "green" : "amber"}
        primary={{ label: "Review approvals", href: "/approvals" }}
        secondary={{ label: "Persona memory", href: "/persona-intelligence" }}
      />

      <ActionFeedback action={action} messages={actionMessages} />

      {approvalId ? (
        <div className="module-rise mb-5 rounded-lg border border-[oklch(0.78_0.14_158/0.3)] bg-[oklch(0.78_0.14_158/0.14)] px-4 py-3 text-sm text-[oklch(0.88_0.1_158)]">
          New approval item created.{" "}
          <Link className="font-semibold underline underline-offset-2" href={`/approvals?item=${approvalId}`}>
            Open review
          </Link>
          .
        </div>
      ) : null}

      {!isLive ? (
        <div className="module-rise mb-5 rounded-lg border border-[oklch(0.82_0.13_85/0.4)] bg-[oklch(0.82_0.13_85/0.14)] px-4 py-3 text-sm text-[oklch(0.9_0.09_85)]">
          <span className="font-semibold">Live data unavailable: </span>
          {dashboard.message}
        </div>
      ) : null}

      <MetricStrip
        metrics={[
          { label: "Queued", value: markRunner?.queuedTasks ?? 0, detail: "Waiting on runner", tone: (markRunner?.queuedTasks ?? 0) > 0 ? "amber" : "gray" },
          { label: "Running", value: markRunner?.runningTasks ?? 0, detail: "Active Mark work", tone: (markRunner?.runningTasks ?? 0) > 0 ? "blue" : "gray" },
          { label: "Needs approval", value: markRunner?.approvalTasks ?? approvals.length, detail: "Human gate", tone: (markRunner?.approvalTasks ?? approvals.length) > 0 ? "amber" : "green", href: "/approvals" },
          { label: "Blocked", value: markRunner?.blockedTasks ?? 0, detail: "Needs attention", tone: (markRunner?.blockedTasks ?? 0) > 0 ? "red" : "green" },
        ]}
      />

      <div className="grid min-w-0 gap-5 2xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="min-w-0 space-y-5">
          <WorkspacePanel
            eyebrow="Command"
            title="Queue a controlled task"
            description="These create backend task records for Mark. They do not send, publish, call, text, launch, or spend."
          >
            <div className="grid gap-3 p-4 lg:grid-cols-3">
              {taskTemplates.map(([taskKey, label, detail]) => (
                <form action={createMarkTaskAction} key={taskKey}>
                  <input name="taskKey" type="hidden" value={taskKey} />
                  <button className="h-full w-full rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-inset)] p-4 text-left transition hover:bg-[var(--surface-raised)]" type="submit">
                    <span className="signal-eyebrow">Queue task</span>
                    <span className="mt-3 block text-lg font-bold tracking-[-0.02em] text-[var(--text-primary)]">{label}</span>
                    <span className="mt-2 block text-sm leading-6 text-[var(--text-secondary)]">{detail}</span>
                    <span className="mt-4 inline-flex text-sm font-bold text-[var(--accent)]">Create task</span>
                  </button>
                </form>
              ))}
            </div>
          </WorkspacePanel>

          <WorkspacePanel
            className="p-0"
            eyebrow="Task pipeline"
            title="What Mark is working on"
            description="A readable queue across discovery, enrichment, scoring, campaign creation, guardrails, and approval prep."
            aside={taskId ? <Link className="text-sm font-bold text-[var(--accent)]" href={`/agent-operations/tasks/${taskId}`}>Open queued task</Link> : null}
          >
            {tasks.length > 0 ? (
              <div className="divide-y divide-[var(--border-hairline)]">
                {tasks.slice(0, 8).map((task) => (
                  <Link className="grid gap-3 px-5 py-4 transition hover:bg-[var(--surface-inset)] lg:grid-cols-[minmax(0,1fr)_150px_150px]" href={task.href} key={task.fullId}>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-[var(--text-primary)]">{task.task}</span>
                        <StatusPill tone={statusTone(task.status)}>{task.status.replaceAll("_", " ")}</StatusPill>
                      </div>
                      <p className="mt-2 line-clamp-2 text-sm leading-6 text-[var(--text-secondary)]">{task.objective}</p>
                    </div>
                    <div className="text-sm text-[var(--text-secondary)]">{task.agentName}</div>
                    <div className="text-sm text-[var(--text-secondary)]">{task.updated}</div>
                  </Link>
                ))}
              </div>
            ) : (
              <EmptyState title="No open task" detail="Queue a task when you want Mark to prepare the next growth action." />
            )}
          </WorkspacePanel>

          <WorkspacePanel
            className="p-0"
            eyebrow="Run log"
            title="Recent outputs"
            description="Completed task output should be understandable here before anyone opens raw records."
          >
            {outputs.length > 0 ? (
              <div className="divide-y divide-[var(--border-hairline)]">
                {outputs.slice(0, 6).map((output) => (
                  <div className="grid gap-3 px-5 py-4 sm:grid-cols-[1fr_auto]" key={`${output.output}-${output.time}`}>
                    <div className="min-w-0">
                      <div className="font-bold text-[var(--text-primary)]">{output.output}</div>
                      <div className="mt-1 text-sm text-[var(--text-secondary)]">{output.agent} / {output.time}</div>
                    </div>
                    <StatusPill tone="gray">{output.status}</StatusPill>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState title="No output yet" detail="Completed task output will appear here after Mark writes it to Supabase." />
            )}
          </WorkspacePanel>
        </div>

        <aside className="min-w-0 space-y-5 2xl:sticky 2xl:top-5 2xl:self-start">
          <WorkspacePanel
            eyebrow="Safety state"
            title={markRunner?.killSwitch ?? "Outbound locked"}
            description="Mark can prepare growth work. Humans approve what moves forward."
            aside={<StatusPill tone="amber">Autonomy level 2</StatusPill>}
          >
            <DetailStack
              items={[
                { label: "Runner", value: markRunner?.runner ?? "Codex OAuth or Claude Code CLI" },
                { label: "Mode", value: markRunner?.mode ?? "Mac mini CLI bridge pending" },
                { label: "Heartbeat", value: markRunner?.lastHeartbeat ?? "No heartbeat yet" },
                { label: "Next", value: markRunner?.nextStep ?? "Start Mark and have him poll queued tasks." },
              ]}
            />
          </WorkspacePanel>

          <WorkspacePanel eyebrow="Subagents" title="Specialists Mark can use">
            <div className="divide-y divide-[var(--border-hairline)]">
              {(agents.length > 0 ? agents : fallbackAgents).slice(0, 6).map((agent) => (
                <div className="px-5 py-3" key={agent.key}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-bold text-[var(--text-primary)]">{agent.name}</div>
                      <p className="mt-1 line-clamp-2 text-sm leading-5 text-[var(--text-secondary)]">{agent.purpose}</p>
                    </div>
                    <StatusPill tone="blue">{agent.status}</StatusPill>
                  </div>
                </div>
              ))}
            </div>
          </WorkspacePanel>

          <WorkspacePanel eyebrow="Review links" title="Waiting on humans">
            {approvals.length > 0 ? (
              <div className="divide-y divide-[var(--border-hairline)]">
                {approvals.slice(0, 4).map((item) => (
                  <Link className="block px-5 py-3 transition hover:bg-[var(--surface-inset)]" href={item.href} key={item.id}>
                    <div className="text-sm font-bold text-[var(--text-primary)]">{item.source}</div>
                    <div className="mt-1 text-xs text-[var(--text-secondary)]">{item.channel} / risk {item.risk}</div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="p-4">
                <EmptyState title="No approvals waiting" detail="When Mark creates reviewable work, it will appear here." />
              </div>
            )}
          </WorkspacePanel>
        </aside>
      </div>
    </AppShell>
  );
}

const fallbackAgents = [
  { key: "lead-discovery", name: "Lead discovery", purpose: "Find partner and lead candidates with evidence.", status: "Ready" },
  { key: "enrichment", name: "Enrichment", purpose: "Normalize contacts, companies, sources, and confidence.", status: "Ready" },
  { key: "scoring", name: "Scoring", purpose: "Rank fit, urgency, revenue potential, and relationship value.", status: "Ready" },
  { key: "copywriting", name: "Copywriting", purpose: "Draft campaigns, emails, ads, SMS, and scripts.", status: "Ready" },
  { key: "guardrails", name: "Guardrails", purpose: "Flag risky language before human review.", status: "Ready" },
];

function getValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function statusTone(status: string): "amber" | "green" | "red" | "blue" {
  if (status === "blocked" || status === "failed") return "red";
  if (status === "needs_approval" || status === "queued") return "amber";
  if (status === "running") return "blue";
  return "green";
}
