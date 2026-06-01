import Link from "next/link";
import { connection } from "next/server";

import { AppShell } from "../_components/app-shell";
import { ActionFeedback, EmptyState, PageHeader, Panel, StatusPill } from "../_components/page-header";
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
  const markRunner = isLive ? dashboard.markRunner : null;
  const nextTask = tasks.find((task) => ["queued", "running", "needs_approval", "blocked"].includes(task.status)) ?? tasks[0] ?? null;

  return (
    <AppShell active="/agent-operations">
      <PageHeader
        eyebrow="Mark"
        title="Queue work and check status"
        description="This page is the simple control room for Mark. Queue one task, see what is open, and jump to approvals when human review is needed."
        aside={<StatusPill tone={isLive ? "green" : "amber"}>{isLive ? "Live" : "Unavailable"}</StatusPill>}
      />

      <ActionFeedback action={action} messages={actionMessages} />

      {approvalId ? (
        <div className="mb-4 rounded-md border border-[oklch(0.78_0.14_158/0.3)] bg-[oklch(0.78_0.14_158/0.14)] px-4 py-3 text-sm text-[oklch(0.88_0.1_158)]">
          New approval item created.{" "}
          <Link className="font-semibold underline underline-offset-2" href={`/approvals?item=${approvalId}`}>
            Open review
          </Link>
          .
        </div>
      ) : null}

      {!isLive ? (
        <div className="mb-4 rounded-md border border-[oklch(0.82_0.13_85/0.4)] bg-[oklch(0.82_0.13_85/0.14)] px-4 py-3 text-sm text-[oklch(0.9_0.09_85)]">
          <span className="font-semibold">Live data unavailable: </span>
          {dashboard.message}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Panel>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="signal-eyebrow">Current state</div>
              <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em]">{markRunner?.status ?? "Mark is not connected yet"}</h2>
              <p className="mt-2 max-w-[60ch] text-sm leading-6 text-[var(--text-secondary)]">
                {markRunner?.mode ?? "The app can queue tasks now. Mark still runs outside the app on your Mac mini."}
              </p>
            </div>
            <StatusPill tone="amber">{markRunner?.killSwitch ?? "Outbound locked"}</StatusPill>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-4">
            <MarkStat label="Queued" value={markRunner?.queuedTasks ?? 0} />
            <MarkStat label="Running" value={markRunner?.runningTasks ?? 0} />
            <MarkStat label="Review" value={markRunner?.approvalTasks ?? approvals.length} />
            <MarkStat label="Blocked" value={markRunner?.blockedTasks ?? 0} />
          </div>
        </Panel>

        <Panel>
          <div className="signal-eyebrow">Queue one task</div>
          <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">These create tasks for Mark. They do not send, publish, call, text, or spend.</p>
          <div className="mt-4 grid gap-2">
            {[
              ["find_plumbing_partners", "Find plumbing partners"],
              ["draft_property_manager_campaign", "Draft property manager campaign"],
              ["refresh_persona_snapshot", "Refresh persona intelligence"],
            ].map(([taskKey, label]) => (
              <form action={createMarkTaskAction} key={taskKey}>
                <input name="taskKey" type="hidden" value={taskKey} />
                <button className="settings-action transition hover:border-[var(--border-strong)]" type="submit">
                  <span className="h-2 w-2 rounded-full bg-[var(--accent)]" />
                  <span className="text-sm font-semibold">{label}</span>
                  <span className="text-xs font-semibold text-[var(--accent)]">Queue</span>
                </button>
              </form>
            ))}
          </div>
        </Panel>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Panel>
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <div className="signal-eyebrow">Next task</div>
              <h2 className="mt-1 text-lg font-semibold tracking-[-0.01em]">What Mark is working on</h2>
            </div>
            {taskId ? (
              <Link className="text-sm font-semibold text-[var(--accent)]" href={`/agent-operations/tasks/${taskId}`}>
                Open queued task
              </Link>
            ) : null}
          </div>

          {nextTask ? (
            <Link className="block rounded-md border border-[var(--border-hairline)] bg-[var(--surface-inset)] p-4 transition hover:border-[var(--border-strong)]" href={nextTask.href}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="font-semibold">{nextTask.task}</div>
                  <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">{nextTask.objective}</p>
                </div>
                <StatusPill tone={statusTone(nextTask.status)}>{nextTask.status.replaceAll("_", " ")}</StatusPill>
              </div>
            </Link>
          ) : (
            <EmptyState title="No open task" detail="Queue a task when you want Mark to prepare the next growth action." />
          )}
        </Panel>

        <Panel>
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <div className="signal-eyebrow">Human review</div>
              <h2 className="mt-1 text-lg font-semibold tracking-[-0.01em]">Approvals</h2>
            </div>
            <Link className="text-sm font-semibold text-[var(--accent)]" href="/approvals">
              Open
            </Link>
          </div>
          {approvals.length > 0 ? (
            <div className="space-y-3">
              {approvals.slice(0, 3).map((item) => (
                <Link className="block rounded-md border border-[var(--border-hairline)] bg-[var(--surface-inset)] p-3 transition hover:border-[var(--border-strong)]" href={item.href} key={item.id}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold">{item.source}</div>
                      <div className="mt-1 text-xs text-[var(--text-secondary)]">{item.channel} / risk {item.risk}</div>
                    </div>
                    <StatusPill tone={item.status === "Blocked" ? "red" : "amber"}>{item.status}</StatusPill>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState title="No approvals waiting" detail="When Mark creates reviewable work, it will appear here." />
          )}
        </Panel>
      </div>

      <Panel className="mt-4">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <div className="signal-eyebrow">Recent output</div>
            <h2 className="mt-1 text-lg font-semibold tracking-[-0.01em]">What Mark produced</h2>
          </div>
        </div>
        {outputs.length > 0 ? (
          <div className="divide-y divide-[var(--border-hairline)]">
            {outputs.slice(0, 5).map((output) => (
              <div className="grid gap-2 py-3 sm:grid-cols-[1fr_auto]" key={`${output.output}-${output.time}`}>
                <div>
                  <div className="font-semibold">{output.output}</div>
                  <div className="mt-1 text-sm text-[var(--text-secondary)]">{output.agent}</div>
                </div>
                <StatusPill tone="gray">{output.status}</StatusPill>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState title="No output yet" detail="Completed task output will appear here after Mark writes it to Supabase." />
        )}
      </Panel>
    </AppShell>
  );
}

function MarkStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-[var(--border-hairline)] bg-[var(--surface-inset)] p-3">
      <div className="text-xs text-[var(--text-muted)]">{label}</div>
      <div className="mt-1 font-display text-3xl font-black tabular-nums tracking-[-0.04em]">{value}</div>
    </div>
  );
}

function getValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function statusTone(status: string): "amber" | "green" | "red" | "blue" {
  if (status === "blocked" || status === "failed") return "red";
  if (status === "needs_approval" || status === "queued") return "amber";
  if (status === "running") return "blue";
  return "green";
}
