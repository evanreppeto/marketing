import Link from "next/link";

import { EmptyState, StatusPill, buttonClasses } from "@/app/_components/page-header";
import type { AgentTaskDetail } from "@/lib/agent-operations/read-model";

type LiveDetail = Extract<AgentTaskDetail, { status: "live" }>;

export function TicketLatestOutput({
  output,
  outputsHref,
}: {
  output: LiveDetail["latestOutput"];
  outputsHref: string;
}) {
  if (!output) {
    return (
      <section className="module-rise rounded-xl border border-[var(--border-panel)] bg-[var(--surface-panel)] p-4 shadow-[var(--elev-panel)]">
        <EmptyState
          title="No output yet"
          detail="When Mark creates a draft, recommendation, or structured packet, the latest version will appear here before anything outbound can move."
        />
      </section>
    );
  }

  return (
    <section className="module-rise rounded-xl border border-[var(--border-panel)] bg-[var(--surface-panel)] shadow-[var(--elev-panel)]">
      <div className="flex flex-col gap-3 border-b border-[var(--border-hairline)] px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="signal-eyebrow">Latest output</span>
            <StatusPill tone="blue">{humanize(output.outputType)}</StatusPill>
            <StatusPill tone={approvalTone(output.approvalStatus)}>{humanize(output.approvalStatus)}</StatusPill>
          </div>
          <h2 className="mt-2 font-display text-xl font-bold text-[var(--text-primary)]">{output.title}</h2>
          <p className="mt-1 text-xs font-semibold text-[var(--text-muted)]">Created {formatDate(output.createdAt)}</p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Link className={buttonClasses({ variant: "ghost", size: "sm" })} href={outputsHref}>
            Open outputs
          </Link>
          {output.approvalHref ? (
            <Link className={buttonClasses({ variant: "primary", size: "sm" })} href={output.approvalHref}>
              Review approval
            </Link>
          ) : null}
        </div>
      </div>

      <div className="px-4 py-4 sm:px-5">
        <p className="max-h-72 overflow-auto whitespace-pre-wrap rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] p-3 text-sm leading-6 text-[var(--text-secondary)]">
          {output.readableBody || "No readable output body captured."}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-semibold text-[var(--text-muted)]">
          <span>Compliance: {humanize(output.complianceStatus)}</span>
          <span>Risk: {humanize(output.riskLevel)}</span>
        </div>
      </div>
    </section>
  );
}

function approvalTone(status: string): "amber" | "green" | "red" | "blue" | "gray" {
  if (status.includes("approved")) return "green";
  if (status.includes("blocked") || status.includes("rejected") || status.includes("failed")) return "red";
  if (status.includes("pending") || status.includes("needs")) return "amber";
  return "gray";
}

function formatDate(value: string | null) {
  if (!value) return "Not recorded";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }).format(date);
}

function humanize(value: string) {
  return value
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
