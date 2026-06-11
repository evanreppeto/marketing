import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import { EmptyState, PageHeader } from "@/app/_components/page-header";
import { TabNav } from "@/app/_components/tab-nav";
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
    <div className="mx-auto w-full max-w-[1180px]">
      <nav className="mb-4 flex flex-wrap items-center gap-2 text-xs font-semibold text-[var(--text-muted)]" aria-label="Breadcrumb">
        <Link className="transition hover:text-[var(--text-primary)]" href="/board">
          Task board
        </Link>
        <span className="text-[var(--border-strong)]">/</span>
        <span className="font-mono text-[var(--text-secondary)]">{task.id.slice(0, 8)}</span>
      </nav>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        <main className="min-w-0">
          <TicketEditableHeader
            description={task.description}
            driverLabel={task.driver.label}
            latestOutputHref={detail.latestOutput ? outputsHref : null}
            objective={task.objective}
            status={task.status}
            taskId={task.id}
            taskType={task.taskType}
          />

          <div className="mt-4">
            <TaskSectionTabs activeSection={activeSection} counts={counts} taskId={task.id} />
          </div>

          <div className="mt-4">
            {activeSection === "overview" ? <TaskOverview detail={detail} outputsHref={outputsHref} /> : null}
            {activeSection === "inputs" ? <TaskInputsPanel inputs={detail.inputs} /> : null}
            {activeSection === "outputs" ? <TaskOutputsPanel outputs={detail.outputs} /> : null}
            {activeSection === "logs" ? <TaskLogsPanel logs={detail.logs} /> : null}
          </div>
        </main>

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
      </div>
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
    <TabNav
      activeKey={activeSection}
      ariaLabel="Task sections"
      columns="sm:grid-cols-2 xl:grid-cols-4"
      tabs={[
        {
          key: "overview",
          label: "Overview",
          detail: "Criteria, latest output, and activity",
          href: `/agent-operations/tasks/${taskId}`,
        },
        {
          key: "inputs",
          label: "Inputs",
          detail: "Context records",
          count: counts.inputs,
          href: `/agent-operations/tasks/${taskId}?section=inputs`,
        },
        {
          key: "outputs",
          label: "Outputs",
          detail: "Mark deliverables",
          count: counts.outputs,
          href: `/agent-operations/tasks/${taskId}?section=outputs`,
        },
        {
          key: "logs",
          label: "Logs",
          detail: "Runner trace",
          count: counts.logs,
          href: `/agent-operations/tasks/${taskId}?section=logs`,
        },
      ]}
    />
  );
}

function TaskOverview({ detail, outputsHref }: { detail: LiveDetail; outputsHref: string }) {
  return (
    <div className="space-y-4">
      <TicketAcceptanceCriteria criteria={detail.acceptanceCriteria} taskId={detail.task.id} />
      <TicketLatestOutput output={detail.latestOutput} outputsHref={outputsHref} />
      <TicketActivityTimeline timeline={detail.timeline} />
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
