import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import { EmptyState, PageHeader, Panel, StatusPill, buttonClasses } from "@/app/_components/page-header";
import { getAgentTaskDetail } from "@/lib/agent-operations/read-model";

import { TaskInputsPanel, TaskLogsPanel, TaskOutputsPanel } from "./task-record-panels";

type PageProps = {
  params: Promise<{ taskId: string }>;
  searchParams?: Promise<{ section?: string | string[] }>;
};

type TaskSectionKey = "overview" | "inputs" | "outputs" | "logs";

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

  const task = detail.task;

  return (
    <>
      <PageHeader
        eyebrow={`${detail.agent.name} task`}
        title={task.objective}
        description={`${humanize(task.taskType)} · ${humanize(task.priority)} priority`}
        aside={
          <div className="flex flex-wrap gap-2">
            <StatusPill tone={statusTone(task.status)}>{humanize(task.status)}</StatusPill>
            <StatusPill tone="amber">Outbound locked</StatusPill>
          </div>
        }
      />

      <div className="mx-auto w-full max-w-[760px] space-y-4">
        <TaskSectionTabs
          activeSection={activeSection}
          counts={{ inputs: detail.inputs.length, outputs: detail.outputs.length, logs: detail.logs.length }}
          taskId={task.id}
        />

        {activeSection === "overview" ? <TaskOverview detail={detail} /> : null}
        {activeSection === "inputs" ? <TaskInputsPanel inputs={detail.inputs} /> : null}
        {activeSection === "outputs" ? <TaskOutputsPanel outputs={detail.outputs} /> : null}
        {activeSection === "logs" ? <TaskLogsPanel logs={detail.logs} /> : null}
      </div>
    </>
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
  const tabs: Array<{ key: TaskSectionKey; label: string; count: number | null }> = [
    { key: "overview", label: "Overview", count: null },
    { key: "inputs", label: "Inputs", count: counts.inputs },
    { key: "outputs", label: "Outputs", count: counts.outputs },
    { key: "logs", label: "Logs", count: counts.logs },
  ];

  return (
    <nav
      aria-label="Mark task sections"
      className="flex gap-1 rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-inset)] p-1"
    >
      {tabs.map((tab) => {
        const isActive = activeSection === tab.key;
        const href = tab.key === "overview" ? `/agent-operations/tasks/${taskId}` : `/agent-operations/tasks/${taskId}?section=${tab.key}`;
        return (
          <Link
            aria-current={isActive ? "page" : undefined}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-bold transition ${
              isActive
                ? "bg-[var(--surface-raised)] text-[var(--text-primary)] shadow-[var(--elev-panel)]"
                : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            }`}
            href={href}
            key={tab.key}
          >
            {tab.label}
            {tab.count !== null ? (
              <span className="rounded-full bg-current/10 px-1.5 text-xs tabular-nums">{tab.count}</span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}

function TaskOverview({ detail }: { detail: Extract<Awaited<ReturnType<typeof getAgentTaskDetail>>, { status: "live" }> }) {
  const task = detail.task;
  const relatedRecord = relatedRecordHref(task.sourceType, task.sourceId);
  const facts: Array<[string, string]> = [
    ["Agent", detail.agent.name],
    ["Status", humanize(task.status)],
    ["Created", formatDate(task.createdAt)],
    ["Updated", formatDate(task.updatedAt)],
  ];
  const links = [
    detail.campaign ? { label: "Campaign", value: detail.campaign.name, href: `/campaigns/${detail.campaign.id}` } : null,
    detail.approval ? { label: "Approval", value: humanize(detail.approval.status), href: detail.approval.href } : null,
    relatedRecord ? { label: "Source record", value: relatedRecord.label, href: relatedRecord.href } : null,
  ].filter((link): link is { label: string; value: string; href: string } => Boolean(link));

  return (
    <Panel>
      <div className="signal-eyebrow">Objective</div>
      <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">{task.objective}</p>

      <dl className="mt-5 grid gap-x-6 gap-y-3 sm:grid-cols-2">
        {facts.map(([label, value]) => (
          <div className="flex items-center justify-between gap-3 border-b border-[var(--border-hairline)] pb-2" key={label}>
            <dt className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">{label}</dt>
            <dd className="truncate text-sm font-bold text-[var(--text-primary)]">{value}</dd>
          </div>
        ))}
      </dl>

      {links.length > 0 ? (
        <div className="mt-5">
          <div className="signal-eyebrow">Linked work</div>
          <div className="mt-2 grid gap-2">
            {links.map((link) => (
              <Link className={buttonClasses({ variant: "ghost", className: "justify-between" })} href={link.href} key={link.label}>
                {link.label}
                <span className="truncate text-[var(--text-muted)]">{link.value}</span>
              </Link>
            ))}
          </div>
        </div>
      ) : null}

      {detail.approval ? (
        <Link className={buttonClasses({ variant: "primary", className: "mt-5 w-full" })} href={detail.approval.href}>
          Open human review
        </Link>
      ) : null}
    </Panel>
  );
}

function relatedRecordHref(sourceType: string | null, sourceId: string | null) {
  if (!sourceType || !sourceId) return null;
  if (sourceType === "company" || sourceType === "companies") return { href: `/crm/companies/${sourceId}`, label: "Company" };
  if (sourceType === "contact" || sourceType === "contacts") return { href: `/crm/contacts/${sourceId}`, label: "Contact" };
  if (sourceType === "lead" || sourceType === "leads") return { href: `/crm/leads/${sourceId}`, label: "Lead" };
  if (sourceType === "property" || sourceType === "properties") return { href: `/crm/properties/${sourceId}`, label: "Property" };
  if (sourceType === "job" || sourceType === "jobs") return { href: `/crm/jobs/${sourceId}`, label: "Job" };
  if (sourceType === "outcome" || sourceType === "outcomes") return { href: `/crm/outcomes/${sourceId}`, label: "Outcome" };
  return null;
}

function statusTone(status: string): "amber" | "green" | "red" | "blue" | "gray" {
  if (["completed", "approved", "passed"].includes(status)) return "green";
  if (["running", "processing"].includes(status)) return "blue";
  if (["blocked", "failed", "error"].includes(status)) return "red";
  if (["queued", "needs_approval", "pending"].includes(status)) return "amber";
  return "gray";
}

function humanize(value: string) {
  return value
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDate(value: string | null) {
  if (!value) return "Not recorded";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }).format(date);
}

function normalizeTaskSection(value: string | undefined): TaskSectionKey {
  if (value === "inputs" || value === "outputs" || value === "logs") return value;
  return "overview";
}

function getValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
