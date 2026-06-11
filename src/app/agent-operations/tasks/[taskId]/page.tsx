import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import { EmptyState, PageHeader, StatusPill, buttonClasses } from "@/app/_components/page-header";
import { getAgentTaskDetail } from "@/lib/agent-operations/read-model";

import { TaskInputsPanel, TaskLogsPanel, TaskOutputsPanel } from "./task-record-panels";

type PageProps = {
  params: Promise<{ taskId: string }>;
  searchParams?: Promise<{ section?: string | string[] }>;
};

type TaskSectionKey = "overview" | "inputs" | "outputs" | "logs";

type LiveDetail = Extract<Awaited<ReturnType<typeof getAgentTaskDetail>>, { status: "live" }>;

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
  const counts = { inputs: detail.inputs.length, outputs: detail.outputs.length, logs: detail.logs.length };

  return (
    <div className="mx-auto w-full max-w-[1080px]">
      <Link
        href="/board"
        className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-[var(--text-muted)] transition hover:text-[var(--text-primary)]"
      >
        <svg aria-hidden viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10 4 6 8l4 4" />
        </svg>
        Task board
      </Link>

      <div className="mt-5 grid items-start gap-x-10 gap-y-6 lg:grid-cols-[minmax(0,1fr)_260px]">
        {/* Main column */}
        <div className="min-w-0">
          <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">
            {humanize(task.taskType)}
          </div>
          <h1
            className="mt-2 text-[22px] font-semibold leading-snug tracking-[-0.01em] text-[var(--text-primary)]"
            style={{ fontFamily: "var(--font-sans)" }}
          >
            {task.objective}
          </h1>

          <div className="mt-5">
            <TaskSectionTabs activeSection={activeSection} counts={counts} taskId={task.id} />
          </div>

          <div className="mt-4">
            {activeSection === "overview" ? <TaskOverview detail={detail} /> : null}
            {activeSection === "inputs" ? <TaskInputsPanel inputs={detail.inputs} /> : null}
            {activeSection === "outputs" ? <TaskOutputsPanel outputs={detail.outputs} /> : null}
            {activeSection === "logs" ? <TaskLogsPanel logs={detail.logs} /> : null}
          </div>
        </div>

        {/* Properties rail */}
        <TaskSidebar detail={detail} />
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
  const tabs: Array<{ key: TaskSectionKey; label: string; count: number | null }> = [
    { key: "overview", label: "Overview", count: null },
    { key: "inputs", label: "Inputs", count: counts.inputs },
    { key: "outputs", label: "Outputs", count: counts.outputs },
    { key: "logs", label: "Logs", count: counts.logs },
  ];

  return (
    <nav aria-label="Task sections" className="flex items-center gap-5 border-b border-[var(--border-hairline)]">
      {tabs.map((tab) => {
        const isActive = activeSection === tab.key;
        const href = tab.key === "overview" ? `/agent-operations/tasks/${taskId}` : `/agent-operations/tasks/${taskId}?section=${tab.key}`;
        return (
          <Link
            aria-current={isActive ? "page" : undefined}
            className={`-mb-px inline-flex items-center gap-1.5 border-b-2 pb-2.5 text-[13px] font-semibold transition ${
              isActive
                ? "border-[var(--accent)] text-[var(--text-primary)]"
                : "border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
            }`}
            href={href}
            key={tab.key}
          >
            {tab.label}
            {tab.count !== null ? (
              <span
                className={`rounded-full px-1.5 text-[11px] font-bold tabular-nums ${
                  isActive ? "bg-[var(--accent-soft)] text-[var(--accent-strong)]" : "bg-[var(--surface-inset)] text-[var(--text-muted)]"
                }`}
              >
                {tab.count}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}

function TaskOverview({ detail }: { detail: LiveDetail }) {
  const tiles: Array<{ label: string; value: number; section: TaskSectionKey }> = [
    { label: "Inputs", value: detail.inputs.length, section: "inputs" },
    { label: "Outputs", value: detail.outputs.length, section: "outputs" },
    { label: "Logs", value: detail.logs.length, section: "logs" },
  ];

  return (
    <div className="space-y-4">
      <p className="text-[13.5px] leading-6 text-[var(--text-secondary)]">
        Mark is preparing this work for you. Nothing is sent, published, or launched from here — anything outbound waits
        for your approval.
      </p>

      <div className="grid grid-cols-3 gap-2.5">
        {tiles.map((tile) => (
          <Link
            href={`/agent-operations/tasks/${detail.task.id}?section=${tile.section}`}
            key={tile.label}
            className="rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-inset)] p-3 transition hover:border-[var(--border-strong)]"
          >
            <div className="text-[22px] font-bold tabular-nums leading-none text-[var(--text-primary)]">{tile.value}</div>
            <div className="mt-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">{tile.label}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}

function TaskSidebar({ detail }: { detail: LiveDetail }) {
  const task = detail.task;
  const relatedRecord = relatedRecordHref(task.sourceType, task.sourceId);
  const links = [
    detail.campaign ? { label: "Campaign", value: detail.campaign.name, href: `/campaigns/${detail.campaign.id}` } : null,
    detail.approval ? { label: "Approval", value: humanize(detail.approval.status), href: detail.approval.href } : null,
    relatedRecord ? { label: "Source record", value: relatedRecord.label, href: relatedRecord.href } : null,
  ].filter((link): link is { label: string; value: string; href: string } => Boolean(link));

  return (
    <aside className="space-y-5 lg:sticky lg:top-5 lg:self-start lg:border-l lg:border-[var(--border-hairline)] lg:pl-6">
      <div className="space-y-3.5">
        <Property label="Status">
          <StatusPill tone={statusTone(task.status)}>{humanize(task.status)}</StatusPill>
        </Property>
        <Property label="Priority">
          <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[var(--text-primary)]">
            <span className="h-2 w-2 rounded-full" style={{ background: priorityDot(task.priority) }} />
            {humanize(task.priority)}
          </span>
        </Property>
        <Property label="Agent">
          <span className="text-[13px] font-semibold text-[var(--text-primary)]">{detail.agent.name}</span>
        </Property>
        <Property label="Outbound">
          <StatusPill tone="amber">Locked</StatusPill>
        </Property>
        <Property label="Created">
          <span className="text-[13px] text-[var(--text-secondary)]">{formatDate(task.createdAt)}</span>
        </Property>
        <Property label="Updated">
          <span className="text-[13px] text-[var(--text-secondary)]">{formatDate(task.updatedAt)}</span>
        </Property>
      </div>

      {links.length > 0 ? (
        <div className="border-t border-[var(--border-hairline)] pt-4">
          <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">Linked</div>
          <div className="mt-2.5 space-y-1.5">
            {links.map((link) => (
              <Link
                key={link.label}
                href={link.href}
                className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-[13px] transition hover:bg-[var(--surface-inset)]"
              >
                <span className="font-semibold text-[var(--text-secondary)]">{link.label}</span>
                <span className="truncate text-[var(--text-muted)]">{link.value}</span>
              </Link>
            ))}
          </div>
        </div>
      ) : null}

      {detail.approval ? (
        <Link className={buttonClasses({ variant: "primary", size: "sm", className: "w-full" })} href={detail.approval.href}>
          Open human review
        </Link>
      ) : null}
    </aside>
  );
}

function Property({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[12px] font-medium text-[var(--text-muted)]">{label}</span>
      <span className="min-w-0 text-right">{children}</span>
    </div>
  );
}

function priorityDot(priority: string): string {
  if (/urgent/i.test(priority)) return "var(--priority)";
  if (/high/i.test(priority)) return "var(--warn)";
  if (/low/i.test(priority)) return "var(--text-muted)";
  return "var(--accent)";
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
