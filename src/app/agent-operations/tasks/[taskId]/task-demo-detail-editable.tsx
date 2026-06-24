"use client";

import Link from "next/link";
import { useRef, useState, type CSSProperties } from "react";

import { StatusPill, buttonClasses } from "@/app/_components/page-header";
import { labelIcon, priorityIcon, statusIcon } from "@/app/_components/ticket-icons";
import type {
  DemoTaskApprover,
  DemoTaskCriterion,
  DemoTaskDetail,
  DemoTaskInput,
  DemoTaskStep,
} from "@/lib/agent-operations/task-demo-detail";
import { badgeStyle, priorityAppearance, statusAppearance } from "../../task-visuals";

/**
 * Editable demo work-ticket. Client-side only (no Supabase): the title, status,
 * priority, acceptance criteria, and an "add comment" composer are all live and
 * mutate local React state for the session. The gold approval gate stays
 * read-only on purpose — approval is a human decision, never an inline toggle.
 */

const STATUS_OPTIONS = [
  { value: "needs_approval", label: "Needs you" },
  { value: "running", label: "Working" },
  { value: "blocked", label: "Blocked" },
  { value: "needs_review", label: "Review" },
  { value: "queued", label: "Scheduled" },
  { value: "completed", label: "Done" },
] as const;

const PRIORITY_OPTIONS = [
  { value: "urgent", label: "Urgent" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
] as const;

type TimelineItem = DemoTaskStep;

export function TaskDemoDetailEditable({ detail, agentName }: { detail: DemoTaskDetail; agentName: string }) {
  const [title, setTitle] = useState(detail.objective);
  const [status, setStatus] = useState(detail.status);
  const [priority, setPriority] = useState(detail.priority);
  const [criteria, setCriteria] = useState<DemoTaskCriterion[]>(detail.criteria);
  const [steps, setSteps] = useState<TimelineItem[]>(detail.steps);
  const [comment, setComment] = useState("");
  const titleRef = useRef<HTMLTextAreaElement | null>(null);

  const statusVisual = statusAppearance(status);
  const priorityVisual = priorityAppearance(priority);
  const metCount = criteria.filter((c) => c.done).length;

  function toggleCriterion(id: string) {
    setCriteria((prev) => prev.map((c) => (c.id === id ? { ...c, done: !c.done } : c)));
  }

  function addComment() {
    const trimmed = comment.trim();
    if (!trimmed) return;
    const next: TimelineItem = {
      id: `local-${Date.now()}`,
      actor: "Human",
      title: "Comment added",
      body: trimmed,
      at: new Date().toISOString(),
      active: true,
    };
    setSteps((prev) => [...prev, next]);
    setComment("");
  }

  return (
    <div className="w-full">
      <nav className="mb-4 flex flex-wrap items-center gap-2 text-xs font-semibold text-[var(--text-muted)]" aria-label="Breadcrumb">
        <Link className="transition hover:text-[var(--text-primary)]" href="/board">
          Task board
        </Link>
        <span className="text-[var(--border-strong)]">/</span>
        <span className="font-mono text-[var(--text-secondary)]">{detail.shortId}</span>
        <span className="ml-1 rounded-md border border-[var(--accent-border)] bg-[var(--accent-soft)] px-2 py-0.5 text-[10px] font-medium text-[var(--accent-contrast)]">
          Editable preview
        </span>
      </nav>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px] 2xl:grid-cols-[minmax(0,1fr)_380px] lg:items-start">
        <main className="min-w-0 space-y-4">
          {/* Work-ticket header — editable title + status/priority selectors */}
          <section
            className="rounded-lg border bg-[var(--surface-panel)] transition-[border-color,box-shadow] duration-200"
            style={{ borderColor: statusVisual.border, boxShadow: `inset 0 2px 0 ${statusVisual.accent}` }}
          >
            <div className="px-5 py-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold text-[var(--text-muted)]">{humanize(detail.taskType)}</span>
                <span className="text-[var(--text-muted)]">/</span>
                <StatusSelect value={status} onChange={setStatus} visual={statusVisual} />
                <PrioritySelect value={priority} onChange={setPriority} visual={priorityVisual} />
                <StatusPill icon={labelIcon("driver")} tone="gray">
                  {detail.driverLabel === "Arc" ? agentName : detail.driverLabel}
                </StatusPill>
                <StatusPill icon={labelIcon("owner")} tone="gray">
                  {detail.ownerLabel}
                </StatusPill>
                <StatusPill icon={labelIcon("lock")} tone="amber">
                  Outbound locked
                </StatusPill>
                {detail.dueAt ? (
                  <StatusPill icon={labelIcon("calendar")} tone="gray">
                    Due {compactDate(detail.dueAt)}
                  </StatusPill>
                ) : null}
              </div>

              <label className="mt-3 block">
                <span className="sr-only">Task title</span>
                <textarea
                  className="w-full resize-none overflow-hidden rounded-md border border-transparent bg-transparent px-0 py-1 text-2xl font-semibold leading-snug tracking-[-0.01em] text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-muted)] focus:border-[var(--border-hairline)] focus:bg-[var(--surface-inset)] focus:px-3 focus:outline focus:outline-2 focus:outline-[var(--accent)]"
                  onChange={(event) => {
                    setTitle(event.target.value);
                    const el = event.target;
                    el.style.height = "auto";
                    el.style.height = `${el.scrollHeight}px`;
                  }}
                  onKeyDown={(event) => {
                    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                      event.preventDefault();
                      event.currentTarget.blur();
                    }
                  }}
                  ref={titleRef}
                  rows={1}
                  value={title}
                />
              </label>
              <p className="mt-2 max-w-[80ch] text-sm leading-7 text-[var(--text-secondary)]">{detail.brief}</p>

              <div className="mt-3 flex items-center gap-3">
                <ProgressBar done={metCount} total={criteria.length} />
                <span className="shrink-0 font-mono text-xs tabular-nums text-[var(--text-muted)]">
                  {metCount}/{criteria.length} criteria
                </span>
              </div>
            </div>
          </section>

          {/* Acceptance criteria — toggleable checkboxes */}
          <section className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-panel)]">
            <div className="flex items-center justify-between gap-3 border-b border-[var(--border-hairline)] px-5 py-3">
              <h2 className="text-sm font-semibold text-[var(--text-primary)]">Acceptance criteria</h2>
              <span className="font-mono text-xs tabular-nums text-[var(--text-muted)]">
                {metCount}/{criteria.length} met
              </span>
            </div>
            <ul className="divide-y divide-[var(--border-hairline)]">
              {criteria.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => toggleCriterion(c.id)}
                    className="flex w-full items-start gap-3 px-5 py-2.5 text-left transition hover:bg-[var(--surface-inset)] active:scale-[0.997]"
                    aria-pressed={c.done}
                  >
                    <Check done={c.done} />
                    <span className={`text-sm leading-6 transition ${c.done ? "text-[var(--text-muted)] line-through" : "text-[var(--text-primary)]"}`}>
                      {c.label}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>

          {/* Produced output + read-only approval gate */}
          <OutputCard detail={detail} agentName={agentName} />

          {/* Inputs / source records */}
          <section className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-panel)]">
            <div className="flex items-center justify-between gap-3 border-b border-[var(--border-hairline)] px-5 py-3">
              <h2 className="text-sm font-semibold text-[var(--text-primary)]">Inputs &amp; source records</h2>
              <span className="font-mono text-xs tabular-nums text-[var(--text-muted)]">{detail.inputs.length}</span>
            </div>
            <ul className="divide-y divide-[var(--border-hairline)]">
              {detail.inputs.map((input) => (
                <InputRow key={input.id} input={input} />
              ))}
            </ul>
          </section>

          {/* Activity timeline + comment composer */}
          <section className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-panel)]">
            <div className="flex items-center justify-between gap-3 border-b border-[var(--border-hairline)] px-5 py-3">
              <h2 className="text-sm font-semibold text-[var(--text-primary)]">{agentName}&apos;s activity</h2>
              <span className="font-mono text-xs tabular-nums text-[var(--text-muted)]">{steps.length}</span>
            </div>
            <Timeline steps={steps} agentName={agentName} />
            <div className="border-t border-[var(--border-hairline)] px-5 py-3">
              <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                <label className="block">
                  <span className="sr-only">Add a comment</span>
                  <input
                    className="min-h-10 w-full rounded-md border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
                    onChange={(event) => setComment(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        addComment();
                      }
                    }}
                    placeholder="Add a comment to the timeline"
                    value={comment}
                  />
                </label>
                <button
                  type="button"
                  className={`${buttonClasses({ variant: "primary", size: "md" })} transition active:scale-95`}
                  disabled={comment.trim().length < 1}
                  onClick={addComment}
                >
                  Comment
                </button>
              </div>
            </div>
          </section>
        </main>

        {/* Right rail */}
        <aside className="space-y-4 lg:sticky lg:top-4">
          <RailCard title="Task information">
            <RailRow label="Status">
              <StatusPill icon={statusIcon(status)} style={badgeStyle(statusVisual)}>
                {statusLabel(status)}
              </StatusPill>
            </RailRow>
            <RailRow label="Priority">
              <StatusPill icon={priorityIcon(priority)} style={badgeStyle(priorityVisual)}>
                {priorityVisual.label}
              </StatusPill>
            </RailRow>
            <RailRow label="Driver">{detail.driverLabel === "Arc" ? agentName : detail.driverLabel}</RailRow>
            <RailRow label="Owner">{detail.ownerLabel}</RailRow>
            <RailRow label="Approver">{detail.approverLabel}</RailRow>
            <RailRow label="Due">{detail.dueAt ? fullDate(detail.dueAt) : "No due date"}</RailRow>
            <RailRow label="Created">{fullDate(detail.createdAt)}</RailRow>
            <RailRow label="Updated">{fullDate(detail.updatedAt)}</RailRow>
          </RailCard>

          {detail.campaign ? (
            <RailCard title="Linked campaign">
              <div className="px-4 py-3">
                <div className="text-sm font-semibold text-[var(--text-primary)]">{detail.campaign.name}</div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[var(--text-muted)]">
                  <StatusPill tone="blue">{detail.campaign.persona}</StatusPill>
                  <StatusPill tone={detail.campaign.status === "Live" ? "green" : "amber"}>{detail.campaign.status}</StatusPill>
                </div>
                <Link className={`${buttonClasses({ variant: "ghost", size: "sm" })} mt-3 w-full`} href="/campaigns">
                  Open campaign
                </Link>
              </div>
            </RailCard>
          ) : null}

          <RailCard title="Approval summary">
            <div className="px-4 py-3">
              <div className="flex items-center gap-2">
                <StatusPill icon={labelIcon("lock")} tone="amber">
                  {detail.approvalRequired ? "Owner approval required" : "Internal task"}
                </StatusPill>
              </div>
              <ul className="mt-3 space-y-2">
                {detail.approvers.map((a) => (
                  <ApproverRow key={a.name} approver={a} agentName={agentName} />
                ))}
              </ul>
              <p className="mt-3 border-t border-[var(--border-hairline)] pt-3 text-xs leading-5 text-[var(--text-muted)]">
                Nothing reaches the outside world until the owner approves. {agentName} prepares; the human decides.
              </p>
            </div>
          </RailCard>

          {detail.linkedRecords.length > 0 ? (
            <RailCard title="Linked records">
              <ul className="divide-y divide-[var(--border-hairline)]">
                {detail.linkedRecords.map((record) => (
                  <li key={`${record.label}-${record.detail}`}>
                    <Link className="flex items-center justify-between gap-3 px-4 py-2.5 transition hover:bg-[var(--surface-inset)]" href={record.href}>
                      <div className="min-w-0">
                        <div className="text-[11px] font-medium text-[var(--text-muted)]">{record.label}</div>
                        <div className="mt-0.5 truncate text-sm font-medium text-[var(--text-primary)]">{record.detail}</div>
                      </div>
                      <span className="shrink-0 text-[var(--text-muted)]">→</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </RailCard>
          ) : null}
        </aside>
      </div>
    </div>
  );
}

function StatusSelect({
  value,
  onChange,
  visual,
}: {
  value: string;
  onChange: (value: string) => void;
  visual: ReturnType<typeof statusAppearance>;
}) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-semibold transition focus-within:outline focus-within:outline-2 focus-within:outline-[var(--accent)]"
      style={badgeStyle(visual) as CSSProperties}
    >
      <span className="inline-flex h-3.5 w-3.5 items-center justify-center [&>svg]:h-3.5 [&>svg]:w-3.5">{statusIcon(value)}</span>
      <select
        aria-label="Status"
        className="cursor-pointer appearance-none bg-transparent pr-3 font-semibold outline-none"
        style={{ color: "inherit" }}
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        {STATUS_OPTIONS.map((option) => (
          <option key={option.value} value={option.value} className="bg-[var(--surface-panel)] text-[var(--text-primary)]">
            {option.label}
          </option>
        ))}
      </select>
      <Chevron />
    </span>
  );
}

function PrioritySelect({
  value,
  onChange,
  visual,
}: {
  value: string;
  onChange: (value: string) => void;
  visual: ReturnType<typeof priorityAppearance>;
}) {
  const normalized = normalizePriority(value);
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-semibold transition focus-within:outline focus-within:outline-2 focus-within:outline-[var(--accent)]"
      style={badgeStyle(visual) as CSSProperties}
    >
      <span className="inline-flex h-3.5 w-3.5 items-center justify-center [&>svg]:h-3.5 [&>svg]:w-3.5">{priorityIcon(value)}</span>
      <select
        aria-label="Priority"
        className="cursor-pointer appearance-none bg-transparent pr-3 font-semibold outline-none"
        style={{ color: "inherit" }}
        onChange={(event) => onChange(event.target.value)}
        value={normalized}
      >
        {PRIORITY_OPTIONS.map((option) => (
          <option key={option.value} value={option.value} className="bg-[var(--surface-panel)] text-[var(--text-primary)]">
            {option.label}
          </option>
        ))}
      </select>
      <Chevron />
    </span>
  );
}

function Chevron() {
  return (
    <svg viewBox="0 0 12 12" className="-ml-2.5 h-3 w-3 shrink-0 opacity-70" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
      <path d="m3 4.5 3 3 3-3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function OutputCard({ detail, agentName }: { detail: DemoTaskDetail; agentName: string }) {
  const { output } = detail;
  const approvalVisual = statusAppearance(output.approvalStatus);
  const riskVisual = priorityAppearance(output.riskLevel);
  const blocked = output.approvalStatus === "blocked";
  const isDraft = output.approvalStatus === "draft";

  return (
    <section className="overflow-hidden rounded-lg border border-[var(--accent-border)] bg-[var(--surface-panel)]">
      <div className="flex flex-col gap-3 border-b border-[var(--border-hairline)] px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-[var(--text-muted)]">Latest output from {agentName}</span>
            <StatusPill icon={labelIcon("output")} tone="blue">
              {humanize(output.outputType)}
            </StatusPill>
            <StatusPill icon={statusIcon(output.approvalStatus)} style={badgeStyle(approvalVisual)}>
              {humanize(output.approvalStatus)}
            </StatusPill>
          </div>
          <h2 className="mt-2 text-lg font-semibold text-[var(--text-primary)]">{output.title}</h2>
          <p className="mt-0.5 font-mono text-xs text-[var(--text-muted)]">{output.formatLabel}</p>
        </div>
      </div>

      <div className="grid gap-4 px-5 py-4 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="min-w-0">
          <p className="whitespace-pre-wrap text-sm leading-7 text-[var(--text-secondary)]">{output.body}</p>

          {output.riskFlags.length > 0 ? (
            <div className="mt-4 rounded-md border border-[var(--warn-border-soft)] bg-[var(--warn-soft)] px-3 py-2.5">
              <div className="text-[11px] font-medium text-[var(--warn-text)]">Review flags</div>
              <ul className="mt-1.5 space-y-1">
                {output.riskFlags.map((flag) => (
                  <li key={flag} className="flex gap-2 text-xs leading-5 text-[var(--text-secondary)]">
                    <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-[var(--warn)]" />
                    {flag}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-[var(--border-hairline)] pt-3">
            <StatusPill icon={statusIcon(output.complianceStatus)} style={badgeStyle(statusAppearance(output.complianceStatus))}>
              Compliance {humanize(output.complianceStatus)}
            </StatusPill>
            <StatusPill icon={priorityIcon(output.riskLevel)} style={badgeStyle(riskVisual)}>
              Risk {output.riskLevel}
            </StatusPill>
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border border-[var(--border-hairline)] bg-[var(--media-void)]">
          <div className="relative flex h-full min-h-[160px] flex-col justify-end bg-gradient-to-br from-[var(--surface-raised)] via-[var(--surface-panel)] to-[var(--surface-inset)] p-4">
            <div aria-hidden className="absolute right-3 top-3 rounded border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--text-muted)]">
              Preview
            </div>
            <div className="text-base font-semibold leading-snug text-[var(--text-primary)]">{output.previewHeadline}</div>
            <div className="mt-1.5 text-xs leading-5 text-[var(--text-secondary)]">{output.previewSub}</div>
            <div className="mt-3 inline-flex w-fit items-center rounded-md bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-[var(--on-accent)]">
              {output.previewCta}
            </div>
          </div>
        </div>
      </div>

      {/* Approval gate — read-only by design. Approval is a human decision, not an inline edit. */}
      <div className="flex flex-col gap-3 border-t border-[var(--border-hairline)] bg-[var(--surface-inset)] px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 text-xs font-semibold text-[var(--text-muted)]">
          <span className="inline-flex h-4 w-4 items-center justify-center text-[var(--warn)] [&>svg]:h-4 [&>svg]:w-4">{labelIcon("lock")}</span>
          {blocked
            ? "Blocked — resolve the flag before this can be approved."
            : isDraft
              ? "Draft — still in progress; not yet ready for approval."
              : "Outbound locked — approve to unlock the next step."}
        </div>
        <div className="flex flex-wrap gap-2">
          <span aria-disabled className={`${buttonClasses({ variant: "approve", size: "sm" })} pointer-events-none opacity-60`}>
            Approve &amp; lock
          </span>
          <span aria-disabled className={`${buttonClasses({ variant: "revision", size: "sm" })} pointer-events-none opacity-60`}>
            Request change
          </span>
          <span aria-disabled className={`${buttonClasses({ variant: "ghost", size: "sm" })} pointer-events-none opacity-60`}>
            Decline
          </span>
        </div>
      </div>
    </section>
  );
}

function Timeline({ steps, agentName }: { steps: DemoTaskStep[]; agentName: string }) {
  return (
    <ol className="px-5 py-2">
      {steps.map((step, i) => {
        const isLast = i === steps.length - 1;
        const tone = stepTone(step.actor);
        return (
          <li key={step.id} className="relative grid grid-cols-[20px_minmax(0,1fr)] gap-3 pb-4 pt-2">
            <div className="relative flex justify-center">
              {!isLast ? <span aria-hidden className="absolute top-4 h-full w-px bg-[var(--border-hairline)]" /> : null}
              <span
                className={`relative mt-1 h-2.5 w-2.5 rounded-full ${tone.dot} ${step.active ? "ring-4 ring-[var(--accent-soft)]" : ""}`}
                aria-hidden
              />
            </div>
            <div className="min-w-0">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
                <div className="flex items-center gap-2">
                  <span className={`text-[11px] font-medium ${tone.text}`}>
                    {step.actor === "Arc" ? agentName : step.actor}
                  </span>
                  <h3 className="text-sm font-semibold text-[var(--text-primary)]">{step.title}</h3>
                </div>
                <time className="shrink-0 font-mono text-[11px] tabular-nums text-[var(--text-muted)]">{relativeDate(step.at)}</time>
              </div>
              <p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">{step.body}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function InputRow({ input }: { input: DemoTaskInput }) {
  const body = (
    <div className="flex items-start justify-between gap-3 px-5 py-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-[var(--text-primary)]">{input.label}</span>
          <span className="rounded border border-[var(--border-strong)] bg-[var(--surface-raised)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--text-secondary)]">
            {input.kind}
          </span>
        </div>
        <p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">{input.detail}</p>
      </div>
      {input.href ? <span className="shrink-0 text-[var(--text-muted)]">→</span> : null}
    </div>
  );
  return (
    <li>
      {input.href ? (
        <Link className="block transition hover:bg-[var(--surface-inset)]" href={input.href}>
          {body}
        </Link>
      ) : (
        body
      )}
    </li>
  );
}

function ApproverRow({ approver, agentName }: { approver: DemoTaskApprover; agentName: string }) {
  const tone = approver.state === "Approved" ? "green" : approver.state === "Waiting" ? "amber" : "gray";
  return (
    <li className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold text-[var(--text-primary)]">{approver.name === "Arc" ? agentName : approver.name}</div>
        <div className="text-xs text-[var(--text-muted)]">{approver.role}</div>
      </div>
      <StatusPill tone={tone}>{approver.state}</StatusPill>
    </li>
  );
}

function RailCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-panel)]">
      <div className="border-b border-[var(--border-hairline)] px-4 py-2.5">
        <h2 className="text-[11px] font-medium text-[var(--text-muted)]">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function RailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2 [&:not(:last-child)]:border-b [&:not(:last-child)]:border-[var(--border-hairline)]">
      <span className="text-xs font-medium text-[var(--text-muted)]">{label}</span>
      <span className="min-w-0 truncate text-right text-sm font-medium text-[var(--text-primary)]">{children}</span>
    </div>
  );
}

function ProgressBar({ done, total }: { done: number; total: number }) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--surface-inset)]">
      <div className="h-full rounded-full bg-gradient-to-r from-[var(--accent)] to-[var(--accent-strong)] transition-[width] duration-300" style={{ width: `${pct}%` }} />
    </div>
  );
}

function Check({ done }: { done: boolean }) {
  return done ? (
    <span className="mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[var(--ok-soft)] text-[var(--ok-text)]" aria-hidden>
      <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3.5 8.5l3 3 6-7" />
      </svg>
    </span>
  ) : (
    <span className="mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-[var(--border-strong)] transition hover:border-[var(--accent)]" aria-hidden />
  );
}

function stepTone(actor: DemoTaskStep["actor"]) {
  if (actor === "Arc") return { dot: "bg-[var(--accent)]", text: "text-[var(--accent-contrast)]" };
  if (actor === "Human") return { dot: "bg-[var(--warn)]", text: "text-[var(--warn-text)]" };
  if (actor === "Approval") return { dot: "bg-[var(--ok)]", text: "text-[var(--ok-text)]" };
  return { dot: "bg-[var(--border-strong)]", text: "text-[var(--text-muted)]" };
}

function normalizePriority(value: string): string {
  const v = value.toLowerCase();
  if (v.includes("urgent")) return "urgent";
  if (v.includes("high")) return "high";
  if (v.includes("medium")) return "medium";
  return "low";
}

function statusLabel(value: string): string {
  const match = STATUS_OPTIONS.find((option) => option.value === value);
  return match ? match.label : statusAppearance(value).label;
}

function humanize(value: string) {
  return value
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function compactDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(date);
}

function fullDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(date);
}

function relativeDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const diffMs = Date.now() - date.getTime();
  const mins = Math.round(diffMs / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}
