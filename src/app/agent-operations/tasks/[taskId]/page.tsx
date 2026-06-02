import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import { IntelligencePanel } from "@/app/_components/intelligence-panel";
import { EmptyState, PageHeader, Panel, StatusPill, buttonClasses } from "@/app/_components/page-header";
import { MetricStrip } from "@/app/_components/workspace";
import { getAgentTaskDetail } from "@/lib/agent-operations/read-model";

type PageProps = {
  params: Promise<{ taskId: string }>;
};

export default async function Page({ params }: PageProps) {
  await connection();

  const { taskId } = await params;
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
          </Panel>

          <TaskInputs inputs={detail.inputs} />
          <TaskOutputs outputs={detail.outputs} />
          <TaskLogs logs={detail.logs} />
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

          <Panel className="module-rise">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="signal-eyebrow">Safe controls</div>
                <h2 className="mt-1 text-lg font-black tracking-[-0.02em] text-[var(--text-primary)]">Repair state</h2>
              </div>
              <StatusPill tone="gray">Not wired</StatusPill>
            </div>
            <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">
              This app can display queued, running, blocked, completed, and approval-needed task state. Safe retry and repair
              buttons need a backend action before they should appear here.
            </p>
          </Panel>
        </aside>
      </div>
    </>
  );
}

function TaskInputs({ inputs }: { inputs: Array<{ id: string; inputType: string; sourceTable: string | null; sourceId: string | null; summary: string; payload: Record<string, unknown> }> }) {
  return (
    <Panel className="module-rise p-0">
      <div className="border-b border-[var(--border-hairline)] bg-[var(--surface-inset)] px-5 py-4">
        <div className="signal-eyebrow">Inputs</div>
        <h2 className="mt-1 text-xl font-black tracking-[-0.03em] text-[var(--text-primary)]">Context Mark received</h2>
      </div>
      <div className="divide-y divide-[var(--border-hairline)]">
        {inputs.length > 0 ? (
          inputs.map((input) => (
            <div key={input.id} className="px-5 py-4">
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill tone="blue">{humanize(input.inputType)}</StatusPill>
                {input.sourceTable ? <span className="text-xs font-semibold text-[var(--text-muted)]">{input.sourceTable}</span> : null}
              </div>
              <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">{input.summary}</p>
              <KeyValuePreview payload={input.payload} />
            </div>
          ))
        ) : (
          <div className="p-5">
            <EmptyState title="No input records" detail="This task has no captured input rows yet." />
          </div>
        )}
      </div>
    </Panel>
  );
}

function TaskOutputs({
  outputs,
}: {
  outputs: Array<{
    id: string;
    title: string;
    outputType: string;
    body: string;
    readableBody: string;
    structuredSections: Array<{ label: string; value: string }>;
    evidence: Array<{ label: string; href: string }>;
    media: Array<{ label: string; href: string; type: "image" | "video" | "file" | "link" }>;
    riskLevel: string;
    complianceStatus: string;
    approvalStatus: string;
    approvalHref: string | null;
    campaignAssetId: string | null;
    createdAt: string | null;
  }>;
}) {
  return (
    <Panel className="module-rise p-0">
      <div className="border-b border-[var(--border-hairline)] bg-[var(--surface-inset)] px-5 py-4">
        <div className="signal-eyebrow">Outputs</div>
        <h2 className="mt-1 text-xl font-black tracking-[-0.03em] text-[var(--text-primary)]">What Mark created</h2>
      </div>
      <div className="divide-y divide-[var(--border-hairline)]">
        {outputs.length > 0 ? (
          outputs.map((output) => (
            <article key={output.id} className="px-5 py-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h3 className="font-bold text-[var(--text-primary)]">{output.title}</h3>
                  <p className="mt-1 text-xs text-[var(--text-muted)]">
                    {humanize(output.outputType)} / risk {humanize(output.riskLevel)} / {formatDate(output.createdAt)}
                  </p>
                </div>
                <StatusPill tone={output.approvalStatus.includes("approved") ? "green" : "amber"}>
                  {humanize(output.approvalStatus)}
                </StatusPill>
              </div>
              {output.readableBody ? (
                <p className="mt-3 whitespace-pre-wrap rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] p-3 text-sm leading-6 text-[var(--text-secondary)]">
                  {output.readableBody}
                </p>
              ) : (
                <p className="mt-3 text-sm leading-6 text-[var(--text-muted)]">No readable output body captured.</p>
              )}
              {output.structuredSections.length > 0 ? (
                <dl className="mt-3 grid gap-2 sm:grid-cols-2">
                  {output.structuredSections.slice(0, 6).map((section) => (
                    <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-3 py-2" key={section.label}>
                      <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">{section.label}</dt>
                      <dd className="mt-1 whitespace-pre-wrap text-sm font-semibold leading-6 text-[var(--text-primary)]">{section.value}</dd>
                    </div>
                  ))}
                </dl>
              ) : null}
              {output.evidence.length > 0 || output.media.length > 0 || output.approvalHref ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {output.approvalHref ? (
                    <Link className={buttonClasses({ variant: "ghost", size: "sm" })} href={output.approvalHref}>
                      Linked approval
                    </Link>
                  ) : null}
                  {output.evidence.slice(0, 4).map((item) => (
                    <a className={buttonClasses({ variant: "ghost", size: "sm" })} href={item.href} key={item.href} rel="noreferrer" target="_blank">
                      {item.label}
                    </a>
                  ))}
                  {output.media.slice(0, 4).map((item) => (
                    <a className={buttonClasses({ variant: "ghost", size: "sm" })} href={item.href} key={item.href} rel="noreferrer" target="_blank">
                      {humanize(item.type)} preview
                    </a>
                  ))}
                </div>
              ) : null}
              {output.body && output.body !== output.readableBody ? (
                <details className="mt-3 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-3 py-2">
                  <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">
                    Raw output packet
                  </summary>
                  <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap text-xs leading-5 text-[var(--text-secondary)]">{output.body}</pre>
                </details>
              ) : null}
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-semibold text-[var(--accent)]">
                <span>Compliance: {humanize(output.complianceStatus)}</span>
                {output.campaignAssetId ? <span className="text-[var(--text-muted)]">Asset: {output.campaignAssetId.slice(0, 8)}</span> : null}
              </div>
            </article>
          ))
        ) : (
          <div className="p-5">
            <EmptyState title="No outputs yet" detail="When Mark produces structured work, outputs appear here with guardrail and approval state." />
          </div>
        )}
      </div>
    </Panel>
  );
}

function TaskLogs({
  logs,
}: {
  logs: Array<{
    id: string;
    runStatus: string;
    modelProvider: string | null;
    modelName: string | null;
    inputTokens: number | null;
    outputTokens: number | null;
    costEstimate: string | null;
    retryCount: number;
    reasoningSummary: string | null;
    errorMessage: string | null;
    startedAt: string | null;
    completedAt: string | null;
    metadata: Record<string, unknown>;
  }>;
}) {
  return (
    <Panel className="module-rise p-0">
      <div className="border-b border-[var(--border-hairline)] bg-[var(--surface-inset)] px-5 py-4">
        <div className="signal-eyebrow">Audit logs</div>
        <h2 className="mt-1 text-xl font-black tracking-[-0.03em] text-[var(--text-primary)]">Runner trace</h2>
      </div>
      <div className="divide-y divide-[var(--border-hairline)]">
        {logs.length > 0 ? (
          logs.map((log) => (
            <div key={log.id} className="px-5 py-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <StatusPill tone={statusTone(log.runStatus)}>{humanize(log.runStatus)}</StatusPill>
                <span className="text-xs font-semibold text-[var(--text-muted)]">
                  {[log.modelProvider, log.modelName].filter(Boolean).join(" / ") || "Runner not recorded"}
                </span>
              </div>
              {log.reasoningSummary ? <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">{log.reasoningSummary}</p> : null}
              {log.errorMessage ? (
                <p className="mt-3 rounded-lg border border-[oklch(0.68_0.2_26/0.45)] bg-[oklch(0.68_0.2_26/0.14)] px-3 py-2 text-sm leading-6 text-[oklch(0.86_0.09_26)]">
                  {log.errorMessage}
                </p>
              ) : null}
              <div className="mt-3 text-xs text-[var(--text-muted)]">
                Started {formatDate(log.startedAt)} / Completed {formatDate(log.completedAt)}
              </div>
              <dl className="mt-3 grid gap-2 sm:grid-cols-4">
                <SmallLogStat label="Input tokens" value={log.inputTokens ?? "Missing"} />
                <SmallLogStat label="Output tokens" value={log.outputTokens ?? "Missing"} />
                <SmallLogStat label="Cost" value={log.costEstimate ?? "Missing"} />
                <SmallLogStat label="Retries" value={log.retryCount} />
              </dl>
              <KeyValuePreview payload={log.metadata} />
            </div>
          ))
        ) : (
          <div className="p-5">
            <EmptyState title="No run logs" detail="Mark should write run logs as he claims, processes, blocks, or completes tasks." />
          </div>
        )}
      </div>
    </Panel>
  );
}

function SmallLogStat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-3 py-2">
      <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">{label}</dt>
      <dd className="mt-1 truncate text-sm font-bold tabular-nums text-[var(--text-primary)]">{value}</dd>
    </div>
  );
}

function KeyValuePreview({ payload }: { payload: Record<string, unknown> }) {
  const entries = Object.entries(payload)
    .filter(([key, value]) => isReadableKey(key) && value !== null && value !== undefined && typeof value !== "object")
    .slice(0, 6);

  if (entries.length === 0) return null;

  return (
    <dl className="mt-3 grid gap-2 sm:grid-cols-2">
      {entries.map(([key, value]) => (
        <div key={key} className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-3 py-2">
          <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">{humanize(key)}</dt>
          <dd className="mt-1 truncate text-sm font-semibold text-[var(--text-primary)]">{String(value)}</dd>
        </div>
      ))}
    </dl>
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

function isReadableKey(key: string) {
  const normalized = key.toLowerCase();
  return !normalized.endsWith("_id") && !normalized.endsWith("_ids") && normalized !== "id" && !/payload|metadata|audit/.test(normalized);
}
