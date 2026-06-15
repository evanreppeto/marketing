"use client";

import { useState } from "react";

import { useAgentName } from "@/app/_components/agent-name-context";
import type { AuditEntry } from "@/lib/campaigns/read-model";

import { SectionHeader } from "./section-header";

type FilterKey = "all" | "user" | "mark";

const ACTOR_META: Record<AuditEntry["actorKind"], { label: string; dot: string; chip: string }> = {
  user: { label: "You", dot: "bg-[var(--accent)]", chip: "border-[oklch(0.74_0.115_232/0.4)] bg-[var(--accent-soft)] text-[var(--chicago-blue-soft)]" },
  mark: { label: "Mark", dot: "bg-[var(--ok)]", chip: "border-[oklch(0.78_0.14_158/0.4)] bg-[oklch(0.78_0.14_158/0.12)] text-[oklch(0.88_0.1_158)]" },
  system: { label: "System", dot: "bg-[var(--border-strong)]", chip: "border-[var(--border-strong)] bg-[var(--surface-raised)] text-[var(--text-secondary)]" },
};

/**
 * Campaign audit trail — a unified, filterable log of operator actions and
 * Mark's activity, newest first. Read-only; every line is a real record.
 */
const AUDIT_PAGE = 40;

export function AuditLog({ entries }: { entries: AuditEntry[] }) {
  const agentName = useAgentName();
  // The "mark" actorKind is a data key; only its displayed label is dynamic.
  const actorLabel = (kind: AuditEntry["actorKind"]) => (kind === "mark" ? agentName : ACTOR_META[kind].label);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [showAll, setShowAll] = useState(false);
  const userCount = entries.filter((entry) => entry.actorKind === "user").length;
  const markCount = entries.filter((entry) => entry.actorKind === "mark").length;
  const visible = filter === "all" ? entries : entries.filter((entry) => entry.actorKind === filter);
  const shown = showAll ? visible : visible.slice(0, AUDIT_PAGE);

  return (
    <div className="space-y-4">
      <p className="max-w-[76ch] text-sm leading-5 text-[var(--text-secondary)]">
        Everything that happened on this campaign — operator actions and {agentName}&rsquo;s activity — newest first. Read-only audit trail.
      </p>

      <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label="Audit actor filter">
        <FilterChip active={filter === "all"} count={entries.length} onClick={() => setFilter("all")}>
          All activity
        </FilterChip>
        <FilterChip active={filter === "user"} count={userCount} dot="bg-[var(--accent)]" onClick={() => setFilter("user")}>
          Operator
        </FilterChip>
        <FilterChip active={filter === "mark"} count={markCount} dot="bg-[var(--ok)]" onClick={() => setFilter("mark")}>
          {agentName}
        </FilterChip>
      </div>

      <section className="overflow-hidden rounded-xl border border-[var(--border-panel)] bg-[var(--surface-panel)] shadow-[var(--elev-panel)]">
        <div className="border-b border-[var(--border-hairline)] bg-[var(--surface-inset)] px-5 py-4">
          <SectionHeader tone="blue" eyebrow="Activity log" detail="Who did what, when." count={visible.length} />
        </div>
        {visible.length === 0 ? (
          <p className="px-5 py-4 text-sm text-[var(--text-muted)]">No activity recorded for this filter yet.</p>
        ) : (
          <ol className="divide-y divide-[var(--border-hairline)]">
            {shown.map((entry) => (
              <li key={entry.id} className="flex items-start gap-3 px-5 py-3">
                <span
                  className={`mt-0.5 inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] ${ACTOR_META[entry.actorKind].chip}`}
                >
                  <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${ACTOR_META[entry.actorKind].dot}`} />
                  {actorLabel(entry.actorKind)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-bold text-[var(--text-primary)]">{entry.action}</div>
                  {entry.detail ? <p className="mt-0.5 text-sm leading-5 text-[var(--text-secondary)]">{entry.detail}</p> : null}
                  <div className="mt-1 font-mono text-xs text-[var(--text-muted)]">
                    {entry.actor} · {entry.at}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        )}
        {!showAll && visible.length > AUDIT_PAGE ? (
          <button
            type="button"
            onClick={() => setShowAll(true)}
            className="w-full border-t border-[var(--border-hairline)] bg-[var(--surface-inset)] px-5 py-2.5 text-xs font-bold text-[var(--accent)] transition hover:bg-[var(--accent-soft)]"
          >
            Show all {visible.length} entries
          </button>
        ) : null}
      </section>
    </div>
  );
}

function FilterChip({
  active,
  count,
  dot,
  onClick,
  children,
}: {
  active: boolean;
  count: number;
  dot?: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] ${
        active
          ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text-primary)]"
          : "border-[var(--border-hairline)] text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-inset)]"
      }`}
    >
      {dot ? <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${dot}`} /> : null}
      {children}
      <span className="font-mono text-xs tabular-nums text-[var(--text-muted)]">{count}</span>
    </button>
  );
}
