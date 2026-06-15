import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import { EmptyState, PageHeader } from "@/app/_components/page-header";
import { labelIcon } from "@/app/_components/ticket-icons";
import { getAgentName } from "@/lib/settings/agent-name";
import { getAgentTaskDetail } from "@/lib/agent-operations/read-model";

import { TaskInputsPanel, TaskLogsPanel, TaskOutputsPanel } from "./task-record-panels";
import { TicketAcceptanceCriteria } from "./ticket-acceptance-criteria";
import { TicketActivityTimeline } from "./ticket-activity-timeline";
import { TicketEditableHeader } from "./ticket-editable-header";
import { TicketLatestOutput } from "./ticket-latest-output";
import { TicketPropertyRail } from "./ticket-property-rail";

type PageProps = {
  params: Promise<{ taskId: string }>;
  searchParams?: Promise<{ section?: string | string[] }>;
};

type TaskSectionKey = "overview" | "inputs" | "outputs" | "logs";

type LiveDetail = Extract<Awaited<ReturnType<typeof getAgentTaskDetail>>, { status: "live" }>;
type TaskWithOptionalSchedule = LiveDetail["task"] & {
  dueAt?: string | null;
  scheduledFor?: string | null;
};

export default async function Page({ params, searchParams }: PageProps) {
  await connection();

  const { taskId } = await params;
  const query = searchParams ? await searchParams : {};
  const activeSection = normalizeTaskSection(getValue(query.section));
  const agentName = await getAgentName();
  const detail = await getAgentTaskDetail(taskId, undefined, agentName);

  if (detail.status === "not_found") {
    notFound();
  }

  if (detail.status === "unavailable") {
    return (
      <>
        <PageHeader eyebrow={`${agentName} task`} title="Task unavailable" description={detail.message} />
        <EmptyState title="Could not load task" detail="The agent task table or related audit tables are unavailable." />
      </>
    );
  }

  const task = detail.task as TaskWithOptionalSchedule;
  const counts = { inputs: detail.inputs.length, outputs: detail.outputs.length, logs: detail.logs.length };
  const outputsHref = `/agent-operations/tasks/${task.id}?section=outputs`;

  return (
    <div className="mx-auto w-full max-w-[940px]">
      <nav className="mb-4 flex flex-wrap items-center gap-2 text-xs font-semibold text-[var(--text-muted)]" aria-label="Breadcrumb">
        <Link className="transition hover:text-[var(--text-primary)]" href="/board">
          Task board
        </Link>
        <span className="text-[var(--border-strong)]">/</span>
        <span className="font-mono text-[var(--text-secondary)]">{task.id.slice(0, 8)}</span>
      </nav>

      <main className="min-w-0 space-y-4">
        <TicketEditableHeader
          description={task.description}
          driverLabel={task.driver.label}
          dueAt={task.dueAt ?? null}
          latestOutput={detail.latestOutput}
          objective={task.objective}
          ownerLabel={task.owner.label}
          priority={task.priority}
          status={task.status}
          taskId={task.id}
          taskType={task.taskType}
        />

        <TicketPropertyRail
          approverLabel={task.approverLabel}
          campaign={detail.campaign}
          createdAt={task.createdAt}
          driverKind={task.driver.kind}
          driverLabel={task.driver.label}
          dueAt={task.dueAt ?? null}
          ownerLabel={task.owner.label}
          priority={task.priority}
          scheduledFor={task.scheduledFor ?? null}
          sourceId={task.sourceId}
          sourceType={task.sourceType}
          status={task.status}
          taskId={task.id}
          updatedAt={task.updatedAt}
        />

        {activeSection === "overview" ? <TaskOverview agentName={agentName} counts={counts} detail={detail} outputsHref={outputsHref} taskId={task.id} /> : null}
        {activeSection !== "overview" ? <TaskRecordHeader activeSection={activeSection} agentName={agentName} counts={counts} taskId={task.id} /> : null}
        {activeSection === "inputs" ? <TaskInputsPanel inputs={detail.inputs} /> : null}
        {activeSection === "outputs" ? <TaskOutputsPanel outputs={detail.outputs} /> : null}
        {activeSection === "logs" ? <TaskLogsPanel logs={detail.logs} /> : null}
      </main>
    </div>
  );
}

function TaskRecordHeader({
  activeSection,
  agentName,
  counts,
  taskId,
}: {
  activeSection: TaskSectionKey;
  agentName: string;
  counts: { inputs: number; outputs: number; logs: number };
  taskId: string;
}) {
  const active = recordLinks(taskId, counts, agentName).find((link) => link.key === activeSection);

  return (
    <section className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-panel)] px-4 py-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <Link className="text-xs font-semibold text-[var(--text-muted)] transition hover:text-[var(--text-primary)]" href={`/agent-operations/tasks/${taskId}`}>
            Back to ticket
          </Link>
          <h2 className="mt-1 text-base font-semibold text-[var(--text-primary)]">{active?.label ?? "Supporting records"}</h2>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">{active?.description ?? `Records ${agentName} used or created while working this ticket.`}</p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {recordLinks(taskId, counts, agentName).map((link) => (
            <Link
              aria-current={activeSection === link.key ? "page" : undefined}
              className={`inline-flex min-h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-semibold transition ${
                activeSection === link.key
                  ? "border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--accent-contrast)]"
                  : "border-[var(--border-hairline)] bg-[var(--surface-inset)] text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"
              }`}
              href={link.href}
              key={link.key}
            >
              {link.label}
              <span className="text-[var(--text-muted)]">{link.count}</span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

function TaskOverview({
  agentName,
  counts,
  detail,
  outputsHref,
  taskId,
}: {
  agentName: string;
  counts: { inputs: number; outputs: number; logs: number };
  detail: LiveDetail;
  outputsHref: string;
  taskId: string;
}) {
  return (
    <div className="space-y-4">
      <TicketLatestOutput agentName={agentName} output={detail.latestOutput} outputsHref={outputsHref} />
      {detail.acceptanceCriteria.length > 0 ? <TicketAcceptanceCriteria criteria={detail.acceptanceCriteria} taskId={detail.task.id} /> : null}
      <SupportingRecords agentName={agentName} counts={counts} taskId={taskId} />
      <details className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-panel)]">
        <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-[var(--text-primary)]">
          Activity timeline
          <span className="ml-2 text-xs font-medium text-[var(--text-muted)]">{detail.timeline.length}</span>
        </summary>
        <TicketActivityTimeline agentName={agentName} timeline={detail.timeline} />
      </details>
    </div>
  );
}

function SupportingRecords({ agentName, counts, taskId }: { agentName: string; counts: { inputs: number; outputs: number; logs: number }; taskId: string }) {
  return (
    <details className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-panel)]">
      <summary className="cursor-pointer list-none px-4 py-3 transition hover:bg-[var(--surface-inset)] [&::-webkit-details-marker]:hidden">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
              <span className="inline-flex h-4 w-4 items-center justify-center text-[var(--text-muted)] [&>svg]:h-4 [&>svg]:w-4">
                {labelIcon("tag")}
              </span>
              Supporting records
            </div>
            <p className="mt-1 text-xs text-[var(--text-muted)]">Inputs, outputs, and logs are here if you need the audit trail.</p>
          </div>
          <span className="text-xs font-semibold text-[var(--text-muted)]">
            {counts.inputs} input / {counts.outputs} output / {counts.logs} logs
          </span>
        </div>
      </summary>
      <div className="grid gap-2 border-t border-[var(--border-hairline)] p-3 sm:grid-cols-3">
        {recordLinks(taskId, counts, agentName).map((link) => (
          <Link
            className="rounded-md border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-3 py-2 transition hover:border-[var(--border-strong)] hover:bg-[var(--surface-raised)]"
            href={link.href}
            key={link.key}
          >
            <div className="flex items-center justify-between gap-2 text-sm font-semibold text-[var(--text-primary)]">
              <span>{link.label}</span>
              <span className="text-xs text-[var(--text-muted)]">{link.count}</span>
            </div>
            <p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">{link.description}</p>
          </Link>
        ))}
      </div>
    </details>
  );
}

function recordLinks(taskId: string, counts: { inputs: number; outputs: number; logs: number }, agentName: string) {
  return [
    {
      key: "inputs" as const,
      label: "Inputs",
      count: counts.inputs,
      description: `What ${agentName} used to do the work.`,
      href: `/agent-operations/tasks/${taskId}?section=inputs`,
    },
    {
      key: "outputs" as const,
      label: "Outputs",
      count: counts.outputs,
      description: `Drafts and packets ${agentName} produced.`,
      href: `/agent-operations/tasks/${taskId}?section=outputs`,
    },
    {
      key: "logs" as const,
      label: "Logs",
      count: counts.logs,
      description: "Step-by-step activity and audit events.",
      href: `/agent-operations/tasks/${taskId}?section=logs`,
    },
  ];
}

function normalizeTaskSection(value: string | undefined): TaskSectionKey {
  if (value === "inputs" || value === "outputs" || value === "logs") return value;
  return "overview";
}

function getValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
