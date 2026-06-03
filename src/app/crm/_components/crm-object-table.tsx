"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { DataTable } from "../../_components/data-table";
import { EmptyState, StatusPill } from "../../_components/page-header";
import { PaginationControls } from "../../_components/pagination-controls";
import { type CrmObjectRow } from "@/lib/crm/read-model";

type CrmListViewKey = "all-records" | "recently-updated" | "needs-review";

type CrmListView = {
  key: CrmListViewKey;
  label: string;
  description: string;
  count: number;
  href: string;
};

const PAGE_SIZES = [6, 10, 20, 50];

export function CrmObjectTable({
  activeView,
  activeViewDescription,
  activeViewLabel,
  objectHref,
  objectLabel,
  primaryField,
  rows,
  secondaryField,
  views,
}: {
  activeView: CrmListViewKey;
  activeViewDescription: string;
  activeViewLabel: string;
  objectHref: string;
  objectLabel: string;
  primaryField: string;
  rows: CrmObjectRow[];
  secondaryField: string;
  views: CrmListView[];
}) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(6);
  const normalizedQuery = query.trim().toLowerCase();

  const searchedRows = useMemo(() => {
    if (!normalizedQuery) return rows;

    return rows.filter((row) =>
      [row.name, row.detail, row.owner, row.status, row.updated]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery),
    );
  }, [normalizedQuery, rows]);

  const pageCount = Math.max(1, Math.ceil(searchedRows.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const startIndex = searchedRows.length === 0 ? 0 : (currentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, searchedRows.length);
  const pagedRows = searchedRows.slice(startIndex, endIndex);

  return (
    <>
      <div className="border-b border-[var(--border-hairline)] bg-[var(--surface-soft)] px-5 py-4">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(420px,0.82fr)] xl:items-start">
          <div className="min-w-0">
            <div className="signal-eyebrow">Records table</div>
            <h2 className="mt-1 font-display text-xl font-bold tracking-[-0.02em] text-[var(--text-primary)]">{objectLabel}</h2>
            <p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">
              {activeViewDescription} Showing {startIndex + (searchedRows.length > 0 ? 1 : 0)}-{endIndex} of{" "}
              {searchedRows.length}
              {searchedRows.length === rows.length ? "" : ` matched from ${rows.length}`}.
            </p>
          </div>

          <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-panel)] p-2">
            <div className="mb-2 flex items-center justify-between gap-3 px-1">
              <span className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--accent)]">Find records</span>
              <span className="font-mono text-xs text-[var(--text-muted)]">{rows.length} total</span>
            </div>
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_126px]">
              <label className="relative block">
                <span className="sr-only">Search {objectLabel}</span>
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
                  className="h-11 w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] py-2 pl-9 pr-3 text-sm font-semibold text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setPage(1);
                  }}
                  placeholder={`Search ${objectLabel.toLowerCase()} by name, owner, status...`}
                  type="search"
                  value={query}
                />
              </label>

              <label className="block">
                <span className="sr-only">Rows per page</span>
                <select
                  className="h-11 w-full cursor-pointer rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-3 text-sm font-bold text-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
                  onChange={(event) => {
                    setPageSize(Number(event.target.value));
                    setPage(1);
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
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {views.map((listView) => (
            <Link
              aria-current={activeView === listView.key ? "page" : undefined}
              className={`inline-flex min-h-9 cursor-pointer items-center rounded-md border px-3 text-sm font-semibold transition hover:-translate-y-0.5 hover:shadow-[var(--elev-panel)] active:translate-y-px ${
                activeView === listView.key
                  ? "border-[oklch(0.74_0.115_232/0.5)] bg-[var(--surface-raised)] text-[var(--text-primary)]"
                  : "border-[var(--border-hairline)] bg-[var(--surface-inset)] text-[var(--text-secondary)] hover:border-[var(--accent)] hover:bg-[var(--surface-raised)]"
              }`}
              href={listView.href}
              key={listView.key}
              title={listView.description}
            >
              {listView.label}
              <span className="ml-2 rounded-full bg-current/10 px-1.5 text-xs">{listView.count}</span>
            </Link>
          ))}
        </div>
      </div>

      <DataTable
        rows={pagedRows}
        rowKey={(row) => row.id}
        rowHref={(row) => `${objectHref}/${row.id}`}
        columns={[
          {
            key: "primary",
            header: primaryField,
            cellClassName: "max-w-[34ch]",
            cell: (row) => <span className="line-clamp-1 font-semibold text-[var(--text-primary)] transition group-hover:text-[var(--accent)]">{row.name}</span>,
          },
          {
            key: "secondary",
            header: secondaryField,
            cellClassName: "max-w-[30ch] text-[var(--text-secondary)]",
            cell: (row) => <span className="line-clamp-2">{row.detail}</span>,
          },
          { key: "owner", header: "Owner", cellClassName: "text-[var(--text-secondary)]", cell: (row) => row.owner },
          { key: "updated", header: "Updated", cellClassName: "text-[var(--text-muted)]", cell: (row) => formatCrmDate(row.updated) },
          {
            key: "status",
            header: "Status",
            headClassName: "px-5",
            cellClassName: "px-5",
            cell: (row) => <StatusPill tone={statusTone(row.status)}>{row.status}</StatusPill>,
          },
        ]}
        emptyState={
          <EmptyState
            title={`No ${activeViewLabel.toLowerCase()} records found`}
            detail={normalizedQuery ? `No records match "${query.trim()}". Clear the search or try another term.` : "No records match this CRM view yet."}
          />
        }
      />

      <PaginationControls
        currentPage={currentPage}
        endIndex={endIndex}
        itemLabel="records"
        onPageChange={setPage}
        pageCount={pageCount}
        startIndex={startIndex}
        total={searchedRows.length}
      />
    </>
  );
}

function statusTone(status: string) {
  if (["Active", "Ready", "Won", "Paid", "High priority", "Qualified", "Validated", "Converted", "Completed"].includes(status)) {
    return "green";
  }

  if (["Out of scope", "Fix", "Lost", "Canceled", "Written Off", "Archived", "Inactive", "Do Not Contact"].includes(status)) {
    return "red";
  }

  return "amber";
}

function formatCrmDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}
