import Link from "next/link";
import { notFound } from "next/navigation";

import { AppShell } from "../../../_components/app-shell";
import { buttonClasses, PageHeader, Panel, StatusPill } from "../../../_components/page-header";
import { getAgentTaskDetail } from "@/lib/agent-operations/read-model";

type AgentTaskDetailPageProps = {
  params: Promise<{ taskId: string }>;
};

export default async function AgentTaskDetailPage({ params }: AgentTaskDetailPageProps) {
  const { taskId } = await params;

  if (!isUuid(taskId)) {
    notFound();
  }

  const detail = await getAgentTaskDetail(taskId);

  if (detail.status === "not_found") notFound();

  if (detail.status === "unavailable") {
    return (
      <AppShell active="/agent-operations">
        <PageHeader
          eyebrow="Agent Task Detail"
          title="Task audit unavailable"
          description={detail.message}
          aside={<StatusPill tone="red">Unavailable</StatusPill>}
        />
      </AppShell>
    );
  }

  const latestOutput = detail.outputs[0];

  return (
    <AppShell active="/agent-operations">
      <PageHeader
        eyebrow="Agent Task Detail"
        title={`${shortId(detail.task.id)}: ${humanize(detail.task.taskType)}`}
        description={detail.task.objective}
        aside={<StatusPill tone={statusTone(detail.task.status)}>{humanize(detail.task.status)}</StatusPill>}
      />

      <div className="grid min-w-0 items-start gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.85fr)]">
        <div className="min-w-0 space-y-4">
          <Panel className="module-rise p-0 [animation-delay:70ms]">
            <div className="grid md:grid-cols-3">
              {[
                ["Agent", detail.agent.name],
                ["Priority", humanize(detail.task.priority)],
                ["Risk", latestOutput ? humanize(latestOutput.riskLevel) : getMetadataText(detail.task.metadata, "risk_level") ?? "Not set"],
                ["Campaign", detail.campaign?.name ?? "No campaign linked"],
                ["Approval", detail.approval ? humanize(detail.approval.status) : "Internal task"],
                ["Updated", detail.task.updatedAt ?? detail.task.createdAt ?? "Not recorded"],
              ].map(([label, value]) => (
                <div className="min-w-0 border-b border-[var(--border-hairline)] p-5 md:border-r md:[&:nth-child(3n)]:border-r-0" key={label}>
                  <div className="text-xs uppercase tracking-[0.14em] text-[var(--text-muted)]">{label}</div>
                  <div className="token-value mt-2 font-semibold">{value}</div>
                </div>
              ))}
            </div>
          </Panel>

          <Panel className="module-rise p-0 [animation-delay:110ms]">
            <div className="border-b border-[var(--border-hairline)] px-5 py-4">
              <h2 className="text-xl font-semibold tracking-[-0.02em]">Source records and prompt inputs</h2>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">The context Mark or Hermes is allowed to use.</p>
            </div>
            <div className="divide-y divide-[var(--border-hairline)]">
              {detail.inputs.map((input) => (
                <div className="grid gap-4 px-5 py-4 md:grid-cols-[220px_1fr]" key={input.id}>
                  <div>
                    <div className="font-semibold">{humanize(input.inputType)}</div>
                    <div className="mt-1 text-xs text-[var(--text-muted)]">
                      {[input.sourceTable, input.sourceId].filter(Boolean).join(": ") || "Operator input"}
                    </div>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm leading-6 text-[var(--text-secondary)]">{input.summary}</p>
                    <div className="mt-3 rounded-md border border-[var(--border-hairline)] bg-[var(--surface-inset)] p-3 font-mono text-xs leading-5 text-[var(--text-primary)]">
                      <pre className="whitespace-pre-wrap break-words">{JSON.stringify(input.payload, null, 2)}</pre>
                    </div>
                  </div>
                </div>
              ))}
              {detail.inputs.length === 0 ? (
                <div className="px-5 py-6 text-sm text-[var(--text-secondary)]">No task inputs have been captured yet.</div>
              ) : null}
            </div>
          </Panel>

          <Panel className="module-rise p-0 [animation-delay:150ms]">
            <div className="border-b border-[var(--border-hairline)] px-5 py-4">
              <h2 className="text-xl font-semibold tracking-[-0.02em]">Outputs</h2>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">Generated output stays inspectable and locked until approval when external-facing.</p>
            </div>
            <div className="divide-y divide-[var(--border-hairline)]">
              {detail.outputs.map((output) => (
                <div className="p-5" key={output.id}>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="text-lg font-semibold">{output.title}</div>
                      <div className="mt-1 text-xs text-[var(--text-muted)]">{humanize(output.outputType)} / {output.createdAt ?? "No timestamp"}</div>
                    </div>
                    <StatusPill tone={statusTone(output.approvalStatus)}>{humanize(output.approvalStatus)}</StatusPill>
                  </div>
                  <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-[var(--text-secondary)]">{output.body || "No output body captured yet."}</p>
                  <div className="mt-4 rounded-md border border-[var(--border-hairline)] bg-[var(--surface-soft)] p-4">
                    <div className="text-sm font-semibold">Compliance result</div>
                    <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
                      {humanize(output.complianceStatus)} / risk {humanize(output.riskLevel)}
                    </p>
                  </div>
                </div>
              ))}
              {detail.outputs.length === 0 ? (
                <div className="px-5 py-6 text-sm text-[var(--text-secondary)]">No outputs have been written yet. Mark has not completed this task.</div>
              ) : null}
            </div>
          </Panel>
        </div>

        <div className="min-w-0 space-y-4">
          <Panel className="module-rise [animation-delay:130ms]">
            <h2 className="text-xl font-semibold tracking-[-0.02em]">Approval state</h2>
            <div className="mt-4 rounded-md border border-[var(--border-hairline)] bg-[var(--surface-soft)] p-4">
              <div className="text-xs uppercase tracking-[0.14em] text-[var(--text-muted)]">Requirement</div>
              <div className="mt-2 font-semibold">
                {detail.approval ? `${humanize(detail.approval.itemType)} review required` : "Internal task only so far"}
              </div>
              <div className="mt-1 text-sm text-[var(--text-secondary)]">
                {detail.approval ? `Risk: ${humanize(detail.approval.riskLevel)}` : "External-facing output should create an approval item before dispatch."}
              </div>
            </div>
            {detail.approval ? (
              <Link
                className={buttonClasses({ variant: "primary", className: "mt-4" })}
                href={detail.approval.href}
              >
                Open approval item
              </Link>
            ) : null}
          </Panel>

          <Panel className="module-rise [animation-delay:170ms]">
            <h2 className="text-xl font-semibold tracking-[-0.02em]">Run log</h2>
            <div className="mt-5 divide-y divide-[var(--border-hairline)]">
              {detail.logs.map((log) => (
                <div className="py-4 first:pt-0 last:pb-0" key={log.id}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-semibold">{humanize(log.runStatus)}</div>
                    <div className="text-xs text-[var(--text-muted)]">{log.modelName ?? log.modelProvider ?? "No model"}</div>
                  </div>
                  <p className="mt-1 text-sm leading-5 text-[var(--text-secondary)]">{log.errorMessage ?? log.reasoningSummary ?? "No reasoning summary captured."}</p>
                  <div className="mt-2 text-xs text-[var(--text-muted)]">{[log.startedAt, log.completedAt].filter(Boolean).join(" -> ") || "Awaiting runner"}</div>
                </div>
              ))}
              {detail.logs.length === 0 ? (
                <div className="py-4 text-sm text-[var(--text-secondary)]">No run logs have been written yet.</div>
              ) : null}
            </div>
          </Panel>

          <Panel className="module-rise [animation-delay:210ms]">
            <h2 className="text-xl font-semibold tracking-[-0.02em]">Agent permissions</h2>
            <div className="mt-4 grid gap-4">
              <PermissionList title="Allowed" items={detail.agent.allowedActions} />
              <PermissionList title="Blocked" items={detail.agent.blockedActions} danger />
            </div>
          </Panel>
        </div>
      </div>
    </AppShell>
  );
}

function PermissionList({ title, items, danger = false }: { title: string; items: string[]; danger?: boolean }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-[0.14em] text-[var(--text-muted)]">{title}</div>
      <div className="mt-3 space-y-2">
        {items.length > 0 ? (
          items.map((item) => (
            <div
              className={`rounded-md border px-3 py-2 text-sm font-semibold ${
                danger ? "border-[oklch(0.68_0.2_26/0.42)] bg-[oklch(0.68_0.2_26/0.16)] text-[oklch(0.86_0.09_26)]" : "border-[var(--border-hairline)] bg-[var(--surface-soft)]"
              }`}
              key={item}
            >
              {item}
            </div>
          ))
        ) : (
          <div className="text-sm text-[var(--text-secondary)]">No permissions recorded.</div>
        )}
      </div>
    </div>
  );
}

function statusTone(status: string): "amber" | "green" | "red" | "blue" {
  if (["blocked", "failed", "declined", "rejected"].includes(status)) return "red";
  if (["needs_approval", "needs_compliance", "pending_owner_approval", "queued"].includes(status)) return "amber";
  if (status === "running") return "blue";
  return "green";
}

function humanize(value: string) {
  return value.replaceAll("_", " ").replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function shortId(id: string) {
  return id.length > 12 ? id.slice(0, 8) : id;
}

function getMetadataText(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key];
  return typeof value === "string" && value.trim() ? value : null;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
