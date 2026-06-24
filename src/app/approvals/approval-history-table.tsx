"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { EmptyState, StatusPill } from "@/app/_components/page-header";
import { PaginationControls } from "@/app/_components/pagination-controls";
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

export function ApprovalHistoryTable({ decisions }: { decisions: ApprovalHistoryEntry[] }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<DecisionFilter>("all");
  const [page, setPage] = useState(1);
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

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const startIndex = filtered.length === 0 ? 0 : (currentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, filtered.length);
  const visibleRows = filtered.slice(startIndex, endIndex);

  function resetPage() {
    setPage(1);
  }

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
              Showing {startIndex + (filtered.length > 0 ? 1 : 0)}-{endIndex} of {filtered.length}
              {filtered.length === decisions.length ? "" : ` matched from ${decisions.length}`} decisions.
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
                  resetPage();
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
                onChange={(event) => {
                  setPageSize(Number(event.target.value));
                  resetPage();
                }}
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
                  resetPage();
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

      <div className="overflow-x-auto">
        <table className="w-full min-w-[1100px] text-sm">
          <thead>
            <tr className="border-b border-[var(--border-hairline)] bg-[var(--surface-inset)] text-left text-xs font-medium text-[var(--text-muted)]">
              <th className="px-5 py-3">When</th>
              <th className="px-5 py-3">Decision</th>
              <th className="px-5 py-3">Item</th>
              <th className="px-5 py-3">Campaign</th>
              <th className="px-5 py-3">Who</th>
              <th className="px-5 py-3">Notes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-hairline)]">
            {visibleRows.map((row) => {
              const href = row.campaignId ? `/campaigns/${row.campaignId}` : `/approvals?item=${row.approvalItemId}`;

              return (
                <tr key={row.id} className="group cursor-pointer align-top transition hover:bg-[var(--surface-raised)] focus-within:bg-[var(--surface-raised)]">
                  <HistoryCell href={href} className="whitespace-nowrap font-mono text-xs text-[var(--text-secondary)]">
                    {formatWhen(row.decidedAt)}
                  </HistoryCell>
                  <HistoryCell href={href}>
                    <StatusPill tone={decisionTone(row.decision)}>{row.decision}</StatusPill>
                  </HistoryCell>
                  <HistoryCell href={href} className="font-semibold text-[var(--text-primary)]">
                    {row.itemType}
                  </HistoryCell>
                  <HistoryCell href={href}>
                    {row.campaignId ? (
                      <span className="font-semibold text-[var(--accent)] transition group-hover:text-[var(--accent-strong)]">
                        {row.campaignName ?? row.campaignId}
                      </span>
                    ) : (
                      <span className="text-[var(--text-muted)]">No campaign linked</span>
                    )}
                  </HistoryCell>
                  <HistoryCell href={href} className="text-[var(--text-secondary)]">
                    {row.decidedBy}
                  </HistoryCell>
                  <HistoryCell href={href} className="max-w-[42ch] text-[var(--text-secondary)]">
                    <span className="line-clamp-2">{row.decisionNotes ?? "No notes captured."}</span>
                  </HistoryCell>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {visibleRows.length === 0 ? (
        <div className="border-t border-[var(--border-hairline)] px-5 py-8">
          <EmptyState title="No matching decisions" detail="Clear the search or choose a different decision filter." />
        </div>
      ) : null}

      <PaginationControls
        currentPage={currentPage}
        endIndex={endIndex}
        itemLabel="decisions"
        onPageChange={setPage}
        pageCount={pageCount}
        startIndex={startIndex}
        total={filtered.length}
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

function HistoryCell({
  children,
  className = "",
  href,
}: {
  children: React.ReactNode;
  className?: string;
  href: string;
}) {
  return (
    <td className="p-0">
      <Link className={`block h-full px-5 py-3 outline-none transition focus-visible:bg-[var(--accent-soft)] ${className}`} href={href}>
        {children}
      </Link>
    </td>
  );
}
