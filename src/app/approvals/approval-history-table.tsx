"use client";

import { useMemo, useState } from "react";
import { type ColumnDef } from "@tanstack/react-table";

import { DataTable } from "@/components/ui/data-table";
import { EmptyState, StatusPill } from "@/app/_components/page-header";
import { theme } from "@/app/_components/theme";
import { type ApprovalHistoryEntry } from "@/lib/approvals/read-model";

type DecisionFilter = "all" | "approved" | "revision" | "declined" | "archived";

const PAGE_SIZES = [10, 25, 50];

const DECISION_FILTERS: Array<{ key: DecisionFilter; label: string }> = [
  { key: "all", label: "All decisions" },
  { key: "approved", label: "Approved" },
  { key: "revision", label: "Revision" },
  { key: "declined", label: "Declined" },
  { key: "archived", label: "Archived" },
];

const COLUMNS: ColumnDef<ApprovalHistoryEntry>[] = [
  {
    id: "when",
    header: "When",
    meta: { cellClassName: "whitespace-nowrap font-mono text-xs text-[var(--text-secondary)]" },
    cell: ({ row }) => formatWhen(row.original.decidedAt),
  },
  {
    id: "decision",
    header: "Decision",
    cell: ({ row }) => <StatusPill tone={decisionTone(row.original.decision)}>{row.original.decision}</StatusPill>,
  },
  {
    id: "item",
    header: "Item",
    meta: { cellClassName: "font-semibold text-[var(--text-primary)]" },
    cell: ({ row }) => row.original.itemType,
  },
  {
    id: "campaign",
    header: "Campaign",
    cell: ({ row }) =>
      row.original.campaignId ? (
        <span className="font-semibold text-[var(--accent)] transition group-hover:text-[var(--accent-strong)]">
          {row.original.campaignName ?? row.original.campaignId}
        </span>
      ) : (
        <span className="text-[var(--text-muted)]">No campaign linked</span>
      ),
  },
  {
    id: "who",
    header: "Who",
    meta: { cellClassName: "text-[var(--text-secondary)]" },
    cell: ({ row }) => row.original.decidedBy,
  },
  {
    id: "notes",
    header: "Notes",
    meta: { cellClassName: "max-w-[42ch] text-[var(--text-secondary)]" },
    cell: ({ row }) => <span className="line-clamp-2">{row.original.decisionNotes ?? "No notes captured."}</span>,
  },
];

function rowHref(row: ApprovalHistoryEntry) {
  return row.campaignId ? `/campaigns/${row.campaignId}` : `/approvals?item=${row.approvalItemId}`;
}

export function ApprovalHistoryTable({ decisions }: { decisions: ApprovalHistoryEntry[] }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<DecisionFilter>("all");
  const [pageSize, setPageSize] = useState(10);
  const normalizedQuery = query.trim().toLowerCase();

  const filtered = useMemo(() => {
    return decisions.filter((row) => {
      const matchesFilter = filter === "all" || decisionBucket(row.decision) === filter;
      const searchable = [
        row.decision,
        row.itemType,
        row.campaignName,
        row.campaignId,
        row.decidedBy,
        row.decisionNotes,
        row.riskLevel,
        row.nextStatus,
        row.previousStatus,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return matchesFilter && (!normalizedQuery || searchable.includes(normalizedQuery));
    });
  }, [decisions, filter, normalizedQuery]);

  if (decisions.length === 0) {
    return (
      <EmptyState
        title="No decisions yet"
        detail="When you approve, decline, revise, archive, or undo work on Today or inside a campaign, it is recorded here."
      />
    );
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-[var(--border-panel)] bg-[var(--surface-panel)]">
      <div className="border-b border-[var(--border-hairline)] bg-[var(--surface-inset)] px-5 py-4">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.8fr)] xl:items-start">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="signal-eyebrow">Decision ledger</span>
              <StatusPill tone="amber">Outbound locked</StatusPill>
            </div>
            <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
              Showing {filtered.length} of {decisions.length}
              {filtered.length === decisions.length ? "" : " matched"} decisions.
            </p>
          </div>

          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_120px]">
            <label className="relative block">
              <span className="sr-only">Search approval history</span>
              <svg
                aria-hidden
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                viewBox="0 0 20 20"
              >
                <circle cx="9" cy="9" r="6" />
                <path d="m18 18-4.5-4.5" strokeLinecap="round" />
              </svg>
              <input
                className="h-11 w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-panel)] py-2 pl-9 pr-3 text-sm font-semibold text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
                onChange={(event) => {
                  setQuery(event.target.value);
                }}
                placeholder="Search decision history..."
                type="search"
                value={query}
              />
            </label>

            <label className="block">
              <span className="sr-only">Rows per page</span>
              <select
                className="h-11 w-full cursor-pointer rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-panel)] px-3 text-sm font-bold text-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
                onChange={(event) => setPageSize(Number(event.target.value))}
                value={pageSize}
              >
                {PAGE_SIZES.map((size) => (
                  <option key={size} value={size}>
                    {size} rows
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-1 border-b border-[var(--border-hairline)] pb-3">
          {DECISION_FILTERS.map((item) => {
            const selected = filter === item.key;
            const count = decisions.filter((decision) => item.key === "all" || decisionBucket(decision.decision) === item.key).length;

            return (
              <button
                aria-pressed={selected}
                className={`relative inline-flex min-h-9 cursor-pointer items-center rounded-[8px] px-3 text-sm font-semibold transition active:translate-y-px ${
                  selected
                    ? "text-[var(--text-primary)]"
                    : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                }`}
                key={item.key}
                onClick={() => {
                  setFilter(item.key);
                }}
                type="button"
              >
                {item.label}
                <span className={`ml-2 font-mono text-xs tabular-nums ${selected ? "text-[var(--accent)]" : "text-[var(--text-muted)]"}`}>{count}</span>
                {selected ? <span aria-hidden className={theme.control.tabMarker} /> : null}
              </button>
            );
          })}
        </div>
      </div>

      <DataTable
        columns={COLUMNS}
        data={filtered}
        getRowId={(row) => row.id}
        rowHref={rowHref}
        minWidth="min-w-[1100px]"
        pageSize={pageSize}
        paginationLabel="decisions"
        emptyState={<EmptyState title="No matching decisions" detail="Clear the search or choose a different decision filter." />}
      />
    </section>
  );
}

function decisionBucket(decision: string): DecisionFilter {
  if (/approved/i.test(decision)) return "approved";
  if (/revision/i.test(decision)) return "revision";
  if (/declined|rejected|blocked/i.test(decision)) return "declined";
  if (/archived/i.test(decision)) return "archived";
  return "all";
}

function decisionTone(decision: string): "green" | "red" | "amber" | "gray" | "blue" {
  if (/approved/i.test(decision)) return "green";
  if (/declined|rejected|blocked/i.test(decision)) return "red";
  if (/revision/i.test(decision)) return "amber";
  if (/reverted/i.test(decision)) return "blue";
  return "gray";
}

function formatWhen(iso: string) {
  return iso.replace("T", " ").replace(/\.\d+Z$/, "Z");
}
