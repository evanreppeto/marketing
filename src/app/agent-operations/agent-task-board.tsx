"use client";

import { useMemo, useState } from "react";

import { useAgentName } from "@/app/_components/agent-name-context";
import { theme } from "@/app/_components/theme";
import { DataTable } from "../_components/data-table";
import { EmptyState, StatusPill } from "../_components/page-header";
import { PaginationControls } from "../_components/pagination-controls";
import { type AgentOperationsTask } from "@/lib/agent-operations/read-model";

type TaskFilter = "all" | "queued" | "running" | "blocked" | "approval" | "completed";

const PAGE_SIZES = [8, 16, 32];

const FILTERS: Array<{ key: TaskFilter; label: string }> = [
  { key: "all", label: "All tasks" },
  { key: "queued", label: "Queued" },
  { key: "running", label: "Running" },
  { key: "blocked", label: "Blocked" },
  { key: "approval", label: "Needs approval" },
  { key: "completed", label: "Completed" },
];

export function AgentTaskBoard({ tasks }: { tasks: AgentOperationsTask[] }) {
  const agentName = useAgentName();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<TaskFilter>("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(8);
  const normalizedQuery = query.trim().toLowerCase();

  const filtered = useMemo(() => {
    return tasks.filter((task) => {
      const matchesFilter = matchesTaskFilter(task, filter);
      const searchable = [
        task.task,
        task.objective,
        task.agentName,
        task.agentKey,
        task.status,
        task.risk,
        task.approval,
        task.linkedObject,
        task.updated,
      ]
        .join(" ")
        .toLowerCase();

      return matchesFilter && (!normalizedQuery || searchable.includes(normalizedQuery));
    });
  }, [filter, normalizedQuery, tasks]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const startIndex = filtered.length === 0 ? 0 : (currentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, filtered.length);
  const visibleTasks = filtered.slice(startIndex, endIndex);

  function resetPage() {
    setPage(1);
  }

  if (tasks.length === 0) {
    return (
      <div className="p-4">
        <EmptyState title={`No ${agentName} tasks yet`} detail={`Queue a task when you want ${agentName} to prepare CRM enrichment, campaign drafts, or approval packets.`} />
      </div>
    );
  }

  return (
    <section className="overflow-hidden">
      <div className="border-b border-[var(--border-hairline)] bg-[var(--surface-inset)] px-5 py-4">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.8fr)] xl:items-start">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="signal-eyebrow">{`${agentName} task queue`}</span>
              <StatusPill tone="amber">Outbound locked</StatusPill>
              <StatusPill tone="blue">{tasks.length} tasks</StatusPill>
            </div>
            <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
              Showing {startIndex + (filtered.length > 0 ? 1 : 0)}-{endIndex} of {filtered.length}
              {filtered.length === tasks.length ? "" : ` matched from ${tasks.length}`} task records.
            </p>
          </div>

          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_120px]">
            <label className="relative block">
              <span className="sr-only">{`Search ${agentName} tasks`}</span>
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
                aria-label={`Search ${agentName} tasks`}
                className="h-11 w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-panel)] py-2 pl-9 pr-3 text-sm font-semibold text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
                onChange={(event) => {
                  setQuery(event.target.value);
                  resetPage();
                }}
                placeholder={`Search ${agentName} tasks...`}
                type="search"
                value={query}
              />
            </label>

            <label className="block">
              <span className="sr-only">{`${agentName} tasks per page`}</span>
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
          {FILTERS.map((item) => {
            const selected = filter === item.key;
            const count = tasks.filter((task) => matchesTaskFilter(task, item.key)).length;

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

      <DataTable
        rows={visibleTasks}
        rowKey={(row) => row.fullId}
        rowHref={(row) => row.href}
        minWidth="min-w-[1020px]"
        columns={[
          {
            key: "task",
            header: "Objective",
            cell: (row) => (
              <>
                <div className="font-bold text-[var(--text-primary)] transition group-hover:text-[var(--accent)]">{row.task}</div>
                <div className="mt-1 line-clamp-2 text-xs text-[var(--text-muted)]">{row.objective}</div>
              </>
            ),
          },
          { key: "agent", header: "Agent", cellClassName: "text-[var(--text-secondary)]", cell: (row) => row.agentName },
          { key: "status", header: "Status", cell: (row) => <StatusPill tone={statusTone(row.status)}>{row.status}</StatusPill> },
          { key: "risk", header: "Risk", cell: (row) => <StatusPill tone={riskTone(row.risk)}>{row.risk}</StatusPill> },
          {
            key: "linked",
            header: "Linked record",
            cell: (row) => <span className="text-sm font-semibold text-[var(--accent)]">{row.linkedObject}</span>,
          },
          { key: "updated", header: "Updated", cellClassName: "text-[var(--text-secondary)]", cell: (row) => row.updated },
        ]}
        emptyState={<EmptyState title={`No matching ${agentName} tasks`} detail="Clear the search or choose a different task status filter." />}
      />

      <PaginationControls
        currentPage={currentPage}
        endIndex={endIndex}
        itemLabel="tasks"
        onPageChange={setPage}
        pageCount={pageCount}
        startIndex={startIndex}
        total={filtered.length}
      />
    </section>
  );
}

function matchesTaskFilter(task: AgentOperationsTask, filter: TaskFilter) {
  if (filter === "all") return true;
  if (filter === "queued") return task.status === "queued";
  if (filter === "running") return task.status === "running";
  if (filter === "blocked") return /blocked|failed|error/i.test(task.status);
  if (filter === "approval") return /approval/i.test(`${task.status} ${task.approval}`);
  if (filter === "completed") return /completed|done|approved/i.test(task.status);
  return true;
}

function statusTone(status: string) {
  if (/complete|active|approved|ready|configured/i.test(status)) return "green";
  if (/blocked|error|failed/i.test(status)) return "red";
  if (/queued|running|approval|pending|review/i.test(status)) return "amber";
  return "blue";
}

function riskTone(risk: string) {
  if (/blocked|high/i.test(risk)) return "red";
  if (/medium|warning/i.test(risk)) return "amber";
  return "green";
}
