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
      <section className="rounded-lg border border-[var(--border-panel)] bg-[var(--surface-panel)] p-4">
        <EmptyState
          title="No output yet"
          detail="When Mark creates a draft, recommendation, or structured packet, the latest version will appear here before anything outbound can move."
        />
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-[var(--border-panel)] bg-[var(--surface-panel)]">
      <div className="flex flex-col gap-3 border-b border-[var(--border-hairline)] px-4 py-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-[var(--text-muted)]">Latest output</span>
            <StatusPill tone="blue">{humanize(output.outputType)}</StatusPill>
            <StatusPill tone={approvalTone(output.approvalStatus)}>{humanize(output.approvalStatus)}</StatusPill>
          </div>
          <h2 className="mt-2 text-lg font-semibold text-[var(--text-primary)]">{output.title}</h2>
          <p className="mt-1 text-xs text-[var(--text-muted)]">Created {formatDate(output.createdAt)}</p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Link className={buttonClasses({ variant: "ghost", size: "sm" })} href={outputsHref}>
            All outputs
          </Link>
        </div>
      </div>

      <div className="px-4 py-4">
        <p className="whitespace-pre-wrap text-sm leading-7 text-[var(--text-secondary)]">
          {output.readableBody || "No readable output body captured."}
        </p>

        <div className="mt-4 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-3 py-3">
          <div className="text-xs font-semibold text-[var(--text-primary)]">Check before approving</div>
          <div className="mt-2 grid gap-2 text-xs text-[var(--text-secondary)] sm:grid-cols-3">
            <ReviewCheck label="No outbound send" />
            <ReviewCheck label="Customer relationship protected" />
            <ReviewCheck label="Approval required" />
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-[var(--text-muted)]">
          <span>Compliance {humanize(output.complianceStatus)}</span>
          <span>Risk {humanize(output.riskLevel)}</span>
        </div>
      </div>
    </section>
  );
}

function ReviewCheck({ label }: { label: string }) {
  return (
    <span className="inline-flex min-h-7 items-center gap-2">
      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
      {label}
    </span>
  );
}

function approvalTone(status: string): "amber" | "green" | "red" | "blue" | "gray" {
  const normalized = status.toLowerCase();
  if (["approved", "auto_approved"].includes(normalized)) return "green";
  if (normalized.includes("blocked") || normalized.includes("rejected") || normalized.includes("failed")) return "red";
  if (normalized.includes("pending") || normalized.includes("needs")) return "amber";
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
