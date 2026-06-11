import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import { EmptyState, PageHeader } from "@/app/_components/page-header";
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
  const detail = await getAgentTaskDetail(taskId);

  if (detail.status === "not_found") {
    notFound();
  }

  if (detail.status === "unavailable") {
    return (
      <>
        <PageHeader eyebrow="Mark task" title="Task unavailable" description={detail.message} />
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
          objective={task.objective}
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

        <TaskSectionTabs activeSection={activeSection} counts={counts} taskId={task.id} />

        {activeSection === "overview" ? <TaskOverview detail={detail} outputsHref={outputsHref} /> : null}
        {activeSection === "inputs" ? <TaskInputsPanel inputs={detail.inputs} /> : null}
        {activeSection === "outputs" ? <TaskOutputsPanel outputs={detail.outputs} /> : null}
        {activeSection === "logs" ? <TaskLogsPanel logs={detail.logs} /> : null}
      </main>
    </div>
  );
}

function TaskSectionTabs({
  activeSection,
  counts,
  taskId,
}: {
  activeSection: TaskSectionKey;
  counts: { inputs: number; outputs: number; logs: number };
  taskId: string;
}) {
  return (
    <nav className="flex flex-wrap items-center gap-1 border-b border-[var(--border-hairline)]" aria-label="Task sections">
      {[
        { key: "overview", label: "Overview", href: `/agent-operations/tasks/${taskId}` },
        { key: "inputs", label: "Inputs", count: counts.inputs, href: `/agent-operations/tasks/${taskId}?section=inputs` },
        { key: "outputs", label: "Outputs", count: counts.outputs, href: `/agent-operations/tasks/${taskId}?section=outputs` },
        { key: "logs", label: "Logs", count: counts.logs, href: `/agent-operations/tasks/${taskId}?section=logs` },
      ].map((tab) => {
        const active = activeSection === tab.key;
        return (
          <Link
            aria-current={active ? "page" : undefined}
            className={`inline-flex min-h-9 items-center gap-2 border-b-2 px-3 text-sm font-semibold transition ${
              active
                ? "border-[var(--accent)] text-[var(--text-primary)]"
                : "border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            }`}
            href={tab.href}
            key={tab.key}
          >
            {tab.label}
            {"count" in tab ? <span className="text-xs text-[var(--text-muted)]">{tab.count}</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}

function TaskOverview({ detail, outputsHref }: { detail: LiveDetail; outputsHref: string }) {
  return (
    <div className="space-y-4">
      <TicketLatestOutput output={detail.latestOutput} outputsHref={outputsHref} />
      {detail.acceptanceCriteria.length > 0 ? <TicketAcceptanceCriteria criteria={detail.acceptanceCriteria} taskId={detail.task.id} /> : null}
      <details className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-panel)]">
        <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-[var(--text-primary)]">
          Activity timeline
          <span className="ml-2 text-xs font-medium text-[var(--text-muted)]">{detail.timeline.length}</span>
        </summary>
        <TicketActivityTimeline timeline={detail.timeline} />
      </details>
    </div>
  );
}

function normalizeTaskSection(value: string | undefined): TaskSectionKey {
  if (value === "inputs" || value === "outputs" || value === "logs") return value;
  return "overview";
}

function getValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
