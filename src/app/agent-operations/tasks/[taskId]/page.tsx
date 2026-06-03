import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import { IntelligencePanel } from "@/app/_components/intelligence-panel";
import { EmptyState, PageHeader, Panel, StatusPill, buttonClasses } from "@/app/_components/page-header";
import { MetricStrip } from "@/app/_components/workspace";
import { getAgentTaskDetail } from "@/lib/agent-operations/read-model";

import { TaskInputsPanel, TaskLogsPanel, TaskOutputsPanel } from "./task-record-panels";

type PageProps = {
  params: Promise<{ taskId: string }>;
  searchParams?: Promise<{ section?: string | string[] }>;
};

type TaskSectionKey = "overview" | "inputs" | "outputs" | "logs";

const taskSections: Array<{ key: TaskSectionKey; label: string; detail: string }> = [
  { key: "overview", label: "Overview", detail: "Task contract and linked work." },
  { key: "inputs", label: "Inputs", detail: "Context Mark received." },
  { key: "outputs", label: "Outputs", detail: "Work Mark created." },
  { key: "logs", label: "Logs", detail: "Runner audit trace." },
];

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
  const relatedRecord = relatedRecordHref(task.sourceType, task.sourceId);

  return (
    <>
      <PageHeader
        eyebrow={`${detail.agent.name} task`}
        title={task.objective}
        description={`${humanize(task.taskType)} / priority ${humanize(task.priority)} / status ${humanize(task.status)}`}
        aside={
          <div className="flex flex-wrap gap-2">
            <StatusPill tone={statusTone(task.status)}>{humanize(task.status)}</StatusPill>
            <StatusPill tone="amber">Outbound locked</StatusPill>
          </div>
        }
      />

      <MetricStrip
        metrics={[
          { label: "Inputs", value: detail.inputs.length, detail: "Task input records", tone: detail.inputs.length > 0 ? "blue" : "gray" },
          { label: "Outputs", value: detail.outputs.length, detail: "Mark-created outputs", tone: detail.outputs.length > 0 ? "blue" : "gray" },
          { label: "Run logs", value: detail.logs.length, detail: "Audit trail", tone: detail.logs.length > 0 ? "blue" : "gray" },
          { label: "Approval", value: detail.approval ? "Linked" : "None", detail: "Human gate status", tone: detail.approval ? "amber" : "gray" },
        ]}
      />

      <div className="grid min-w-0 items-start gap-5 2xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="min-w-0 space-y-5">
          <TaskSectionTabs
            activeSection={activeSection}
            counts={{
              inputs: detail.inputs.length,
              logs: detail.logs.length,
              outputs: detail.outputs.length,
            }}
            taskId={task.id}
          />

          {activeSection === "overview" ? <TaskOverview detail={detail} /> : null}
          {activeSection === "inputs" ? <TaskInputsPanel inputs={detail.inputs} /> : null}
          {activeSection === "outputs" ? <TaskOutputsPanel outputs={detail.outputs} /> : null}
          {activeSection === "logs" ? <TaskLogsPanel logs={detail.logs} /> : null}
        </div>

        <aside className="min-w-0 space-y-5 2xl:sticky 2xl:top-5 2xl:self-start">
          <IntelligencePanel
            model={{
              title: "Mark audit context",
              persona: detail.campaign?.persona ?? getString(task.metadata.persona) ?? "Unassigned",
              confidence: detail.outputs.length > 0 ? "Output captured" : "Waiting on Mark",
              journeyStage: humanize(task.status),
              urgency: humanize(task.priority),
              attentionReason: task.objective,
              nextBestAction: nextActionForTask(task.status, Boolean(detail.approval)),
              cta: "Human reviews the output. Mark never sends, publishes, launches, spends, or contacts from this page.",
              messageAngle: detail.campaign?.objective ?? "Agent work should stay evidence-backed and approval-ready.",
              guardrailStatus: "Outbound locked. Retry/repair controls are not enabled unless a backend action supports them.",
              scores: [
                { label: "Inputs", value: detail.inputs.length, detail: "Context records", tone: detail.inputs.length > 0 ? "blue" : "gray" },
                { label: "Outputs", value: detail.outputs.length, detail: "Created records", tone: detail.outputs.length > 0 ? "blue" : "gray" },
                { label: "Logs", value: detail.logs.length, detail: "Audit entries", tone: detail.logs.length > 0 ? "blue" : "gray" },
              ],
              proofPoints: [
                detail.campaign ? `Campaign: ${detail.campaign.name}` : null,
                detail.approval ? `Approval item: ${humanize(detail.approval.status)}` : null,
                task.sourceType && task.sourceId ? `Source: ${task.sourceType} ${task.sourceId}` : null,
              ].filter((item): item is string => Boolean(item)),
              outboundLocked: true,
            }}
          />

          <Panel className="module-rise">
            <div className="signal-eyebrow">Linked work</div>
            <div className="mt-4 grid gap-2">
              {detail.campaign ? (
                <Link className={buttonClasses({ variant: "ghost", className: "justify-between" })} href={`/campaigns/${detail.campaign.id}`}>
                  Campaign
                  <span className="text-[var(--text-muted)]">{detail.campaign.name}</span>
                </Link>
              ) : null}
              {detail.approval ? (
                <Link className={buttonClasses({ variant: "ghost", className: "justify-between" })} href={detail.approval.href}>
                  Approval
                  <span className="text-[var(--text-muted)]">{humanize(detail.approval.status)}</span>
                </Link>
              ) : null}
              {relatedRecord ? (
                <Link className={buttonClasses({ variant: "ghost", className: "justify-between" })} href={relatedRecord.href}>
                  Source record
                  <span className="text-[var(--text-muted)]">{relatedRecord.label}</span>
                </Link>
              ) : null}
              {!detail.campaign && !detail.approval && !relatedRecord ? (
                <p className="text-sm leading-6 text-[var(--text-secondary)]">No campaign, approval, or source record is linked yet.</p>
              ) : null}
            </div>
          </Panel>

          <TaskReadinessPanel detail={detail} />
        </aside>
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
  counts: { inputs: number; logs: number; outputs: number };
  taskId: string;
}) {
  return (
    <section className="module-rise overflow-hidden rounded-xl border border-[var(--border-panel)] bg-[var(--surface-panel)] shadow-[var(--elev-panel)]">
      <div className="flex flex-col gap-2 border-b border-[var(--border-hairline)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm font-semibold text-[var(--text-secondary)]">
          Inspect one part of the task at a time. Mark prepares; humans approve.
        </p>
        <StatusPill tone="amber">Outbound locked</StatusPill>
      </div>
      <nav aria-label="Mark task sections" className="grid gap-2 p-2 md:grid-cols-4">
        {taskSections.map((section) => {
          const isActive = activeSection === section.key;
          const count = section.key === "inputs" ? counts.inputs : section.key === "outputs" ? counts.outputs : section.key === "logs" ? counts.logs : null;
          const href = section.key === "overview" ? `/agent-operations/tasks/${taskId}` : `/agent-operations/tasks/${taskId}?section=${section.key}`;

          return (
            <Link
              aria-current={isActive ? "page" : undefined}
              className={`rounded-lg border px-4 py-3 transition duration-200 hover:-translate-y-0.5 active:translate-y-px ${
                isActive
                  ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text-primary)] shadow-[0_0_20px_oklch(0.74_0.115_232/0.18)]"
                  : "border-transparent bg-[var(--surface-inset)] text-[var(--text-secondary)] hover:border-[var(--accent)] hover:bg-[var(--surface-raised)] hover:text-[var(--text-primary)]"
              }`}
              href={href}
              key={section.key}
            >
              <span className="flex items-center justify-between gap-3 text-sm font-bold">
                {section.label}
                {count !== null ? <span className="rounded-full bg-current/10 px-1.5 text-xs tabular-nums">{count}</span> : null}
              </span>
              <span className="mt-1 block text-xs leading-5 text-[var(--text-muted)]">{section.detail}</span>
            </Link>
          );
        })}
      </nav>
    </section>
  );
}

function TaskOverview({ detail }: { detail: Extract<Awaited<ReturnType<typeof getAgentTaskDetail>>, { status: "live" }> }) {
  const task = detail.task;

  return (
    <Panel className="module-rise">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="signal-eyebrow">Task contract</div>
          <h2 className="mt-1 text-xl font-black tracking-[-0.03em] text-[var(--text-primary)]">What Mark was asked to do</h2>
          <p className="mt-2 max-w-[72ch] text-sm leading-6 text-[var(--text-secondary)]">{task.objective}</p>
        </div>
        <Link className={buttonClasses({ variant: "ghost", size: "sm" })} href="/agent-operations">
          Back to Mark
        </Link>
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Agent", detail.agent.name],
          ["Policy", detail.agent.approvalPolicy],
          ["Created", formatDate(task.createdAt)],
          ["Updated", formatDate(task.updatedAt)],
        ].map(([label, value]) => (
          <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] p-3" key={label}>
            <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">{label}</div>
            <div className="mt-1 truncate text-sm font-bold text-[var(--text-primary)]">{value}</div>
          </div>
        ))}
      </div>

      <div className="mt-5 grid gap-3 lg:grid-cols-3">
        <OverviewLinkCard
          detail={`${detail.inputs.length} input records captured`}
          href={`/agent-operations/tasks/${task.id}?section=inputs`}
          label="Inputs"
        />
        <OverviewLinkCard
          detail={`${detail.outputs.length} outputs and approval states`}
          href={`/agent-operations/tasks/${task.id}?section=outputs`}
          label="Outputs"
        />
        <OverviewLinkCard
          detail={`${detail.logs.length} runner log entries`}
          href={`/agent-operations/tasks/${task.id}?section=logs`}
          label="Audit logs"
        />
      </div>
    </Panel>
  );
}

function OverviewLinkCard({ detail, href, label }: { detail: string; href: string; label: string }) {
  return (
    <Link
      className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] p-4 transition hover:-translate-y-0.5 hover:border-[var(--accent)] hover:bg-[var(--surface-raised)]"
      href={href}
    >
      <div className="font-bold text-[var(--text-primary)]">{label}</div>
      <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">{detail}</p>
      <div className="mt-3 text-sm font-bold text-[var(--accent)]">Open section</div>
    </Link>
  );
}

function TaskReadinessPanel({ detail }: { detail: Extract<Awaited<ReturnType<typeof getAgentTaskDetail>>, { status: "live" }> }) {
  const checkpoints = [
    {
      label: "Context",
      value: `${detail.inputs.length} ${plural("input", detail.inputs.length)}`,
      note: detail.inputs.length > 0 ? "Mark received task context." : "No task inputs captured yet.",
      tone: detail.inputs.length > 0 ? "green" : "amber",
    },
    {
      label: "Output",
      value: `${detail.outputs.length} ${plural("output", detail.outputs.length)}`,
      note: detail.outputs.length > 0 ? "Created work is available to inspect." : "Waiting for Mark-created records.",
      tone: detail.outputs.length > 0 ? "green" : "amber",
    },
    {
      label: "Human gate",
      value: detail.approval ? humanize(detail.approval.status) : "Not linked",
      note: detail.approval ? "Review stays with the operator." : "No approval item is attached to this task.",
      tone: detail.approval ? "amber" : "gray",
    },
    {
      label: "Audit trail",
      value: `${detail.logs.length} ${plural("log", detail.logs.length)}`,
      note: detail.logs.length > 0 ? "Runner activity is traceable." : "Mark should write logs when he runs.",
      tone: detail.logs.length > 0 ? "green" : "amber",
    },
  ] as const;

  return (
    <Panel className="module-rise">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="signal-eyebrow">Task readiness</div>
          <h2 className="mt-1 text-lg font-black tracking-[-0.02em] text-[var(--text-primary)]">Operator checkpoint</h2>
        </div>
        <StatusPill tone="amber">Outbound locked</StatusPill>
      </div>

      <div className="mt-4 grid gap-2">
        {checkpoints.map((checkpoint) => (
          <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] p-3" key={checkpoint.label}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">{checkpoint.label}</div>
                <div className="mt-1 truncate text-sm font-black text-[var(--text-primary)]">{checkpoint.value}</div>
              </div>
              <StatusPill tone={checkpoint.tone}>{checkpoint.tone === "green" ? "Ready" : checkpoint.tone === "amber" ? "Review" : "Open"}</StatusPill>
            </div>
            <p className="mt-2 text-xs leading-5 text-[var(--text-secondary)]">{checkpoint.note}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 grid gap-2">
        {detail.approval ? (
          <Link className={buttonClasses({ variant: "primary", className: "w-full" })} href={detail.approval.href}>
            Open human review
          </Link>
        ) : null}
        {detail.campaign ? (
          <Link className={buttonClasses({ variant: "ghost", className: "w-full" })} href={`/campaigns/${detail.campaign.id}`}>
            Open campaign package
          </Link>
        ) : null}
      </div>

      <p className="mt-4 text-xs leading-5 text-[var(--text-muted)]">
        This page only inspects Mark work. Sending, publishing, launching, spending, and contact actions remain unavailable here.
      </p>
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

function nextActionForTask(status: string, hasApproval: boolean) {
  if (status === "queued") return "Start Mark on the Mac mini runner and let him claim the task.";
  if (status === "running") return "Monitor logs and outputs. Do not approve outbound work until an approval item exists.";
  if (status === "blocked") return "Read the latest run log, fix the missing input or schema issue, then queue a repair task.";
  if (status === "needs_approval" || hasApproval) return "Open the linked approval item and make the human decision.";
  if (status === "completed") return "Review outputs and connect any learning back to campaign, CRM, or persona records.";
  return "Review task state before taking action.";
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

function getString(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

function normalizeTaskSection(value: string | undefined): TaskSectionKey {
  if (value === "inputs" || value === "outputs" || value === "logs") return value;
  return "overview";
}

function getValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function plural(label: string, count: number) {
  return count === 1 ? label : `${label}s`;
}
