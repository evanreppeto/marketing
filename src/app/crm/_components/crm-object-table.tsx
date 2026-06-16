"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { EmptyState, StatusPill } from "../../_components/page-header";
import { type CrmObjectRow } from "@/lib/crm/read-model";

type CrmListViewKey = "all-records" | "recently-updated" | "needs-review";
type DataFilter = "all" | "missing" | "complete";

type CrmListView = {
  key: CrmListViewKey;
  label: string;
  description: string;
  count: number;
  href: string;
};

const PAGE_SIZES = [8, 16, 25];

export function CrmObjectTable({
  activeView,
  activeViewDescription,
  activeViewLabel,
  objectHref,
  objectLabel,
  primaryField,
  rows,
  secondaryField,
  selectedRecordId,
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
  selectedRecordId?: string;
  views: CrmListView[];
}) {
  const router = useRouter();
  const clickTimeoutRef = useRef<number | null>(null);
  const [query, setQuery] = useState("");
  const [dataFilter, setDataFilter] = useState<DataFilter>("all");
  const [ownerFilter, setOwnerFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(8);
  const normalizedQuery = query.trim().toLowerCase();
  const ownerOptions = useMemo(() => uniqueSorted(rows.map((row) => row.owner)), [rows]);

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      const matchesData =
        dataFilter === "all" ||
        (dataFilter === "missing" && row.missingFields.length > 0) ||
        (dataFilter === "complete" && row.missingFields.length === 0);
      const matchesOwner = ownerFilter === "all" || row.owner === ownerFilter;
      const searchable = [
        row.id,
        row.name,
        row.detail,
        row.owner,
        row.status,
        row.updated,
        row.personaTag,
        row.sourceLabel,
        row.valueLabel,
        row.nextStep,
        ...row.missingFields,
        ...row.relationships.flatMap((relationship) => [relationship.label, relationship.value]),
      ]
        .join(" ")
        .toLowerCase();

      return matchesData && matchesOwner && (!normalizedQuery || searchable.includes(normalizedQuery));
    });
  }, [dataFilter, normalizedQuery, ownerFilter, rows]);

  const pageCount = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const startIndex = filteredRows.length === 0 ? 0 : (currentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, filteredRows.length);
  const visibleRows = filteredRows.slice(startIndex, endIndex);

  useEffect(() => {
    return () => {
      if (clickTimeoutRef.current) {
        window.clearTimeout(clickTimeoutRef.current);
      }
    };
  }, []);

  function resetPage() {
    setPage(1);
  }

  function selectedHref(row: CrmObjectRow) {
    const params = new URLSearchParams();
    if (activeView !== "all-records") {
      params.set("view", activeView);
    }
    params.set("selected", row.id);
    return `${objectHref}?${params.toString()}`;
  }

  function selectRecord(row: CrmObjectRow) {
    router.replace(selectedHref(row), { scroll: false });
  }

  function openRecord(row: CrmObjectRow) {
    router.push(row.href);
  }

  function scheduleSelectRecord(row: CrmObjectRow) {
    if (clickTimeoutRef.current) {
      window.clearTimeout(clickTimeoutRef.current);
    }

    clickTimeoutRef.current = window.setTimeout(() => {
      selectRecord(row);
      clickTimeoutRef.current = null;
    }, 180);
  }

  function openRecordFromDoubleClick(row: CrmObjectRow) {
    if (clickTimeoutRef.current) {
      window.clearTimeout(clickTimeoutRef.current);
      clickTimeoutRef.current = null;
    }

    openRecord(row);
  }

  function handleRowKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, row: CrmObjectRow) {
    if (event.key === "Enter") {
      openRecord(row);
      return;
    }

    if (event.key === " ") {
      event.preventDefault();
      selectRecord(row);
    }
  }

  return (
    <>
      <div className="border-b border-[var(--border-hairline)] bg-[var(--surface-inset)] px-4 py-3">
        <div className="grid gap-2 xl:grid-cols-[minmax(240px,1fr)_160px_150px_112px]">
          <label className="relative block">
            <span className="sr-only">Search {objectLabel}</span>
            <SearchIcon />
            <input
              aria-label={`Search ${objectLabel}`}
              className="h-10 w-full rounded-md border border-[var(--border-hairline)] bg-[var(--surface-panel)] py-2 pl-9 pr-3 text-sm font-medium text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
              onChange={(event) => {
                setQuery(event.target.value);
                resetPage();
              }}
              placeholder={`Search ${objectLabel.toLowerCase()}...`}
              type="search"
              value={query}
            />
          </label>

          <label className="block">
            <span className="sr-only">List view</span>
            <select
              className="h-10 w-full cursor-pointer rounded-md border border-[var(--border-hairline)] bg-[var(--surface-panel)] px-3 text-sm font-semibold text-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
              onChange={(event) => {
                window.location.href = event.target.value;
              }}
              value={viewHref(objectHref, activeView)}
            >
              {views.map((view) => (
                <option key={view.key} value={view.href}>
                  View: {view.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="sr-only">Data quality</span>
            <select
              className="h-10 w-full cursor-pointer rounded-md border border-[var(--border-hairline)] bg-[var(--surface-panel)] px-3 text-sm font-semibold text-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
              onChange={(event) => {
                setDataFilter(event.target.value as DataFilter);
                resetPage();
              }}
              value={dataFilter}
            >
              <option value="all">Data: All</option>
              <option value="missing">Data: Missing</option>
              <option value="complete">Data: Complete</option>
            </select>
          </label>

          <FilterSelect
            label="Owner"
            onChange={(value) => {
              setOwnerFilter(value);
              resetPage();
            }}
            options={ownerOptions}
            value={ownerFilter}
          />
        </div>

        <div className="mt-3 flex flex-col gap-2 text-sm text-[var(--text-secondary)] lg:flex-row lg:items-center lg:justify-between">
          <p>
            {activeViewDescription} Showing {filteredRows.length === 0 ? "0" : `${startIndex + 1}-${endIndex}`} of{" "}
            {filteredRows.length.toLocaleString("en-US")}
            {filteredRows.length === rows.length ? "" : ` matched from ${rows.length.toLocaleString("en-US")}`}.
          </p>
          <div className="flex flex-wrap gap-2">
            {views.map((view) => (
              <Link
                aria-current={activeView === view.key ? "page" : undefined}
                className={`inline-flex min-h-8 items-center gap-2 rounded-md border px-2.5 text-xs font-semibold transition ${
                  activeView === view.key
                    ? "border-[var(--accent-border-strong)] bg-[var(--accent-soft)] text-[var(--accent-contrast)]"
                    : "border-[var(--border-hairline)] bg-[var(--surface-panel)] text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
                }`}
                href={view.href}
                key={view.key}
                title={view.description}
              >
                {view.label}
                <span className="font-mono">{view.count}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] border-separate border-spacing-0 text-left text-sm">
          <thead>
            <tr className="bg-[var(--surface-inset)] text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">
              {[primaryField, secondaryField, "Persona", "Signal", "Status", "Updated", "Owner"].map((header) => (
                <th className="border-b border-[var(--border-hairline)] px-3 py-3" key={header} scope="col">
                  <span className="inline-flex items-center gap-1">
                    {header}
                    <SortIcon />
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => {
              const selected = selectedRecordId === row.id;
              const cellButtonClass = "block h-full w-full bg-transparent px-3 py-3 text-left outline-none transition focus-visible:bg-[var(--surface-raised)]";
              return (
                <tr
                  aria-current={selected ? "page" : undefined}
                  className={`group transition duration-150 hover:bg-[var(--surface-raised)] ${selected ? "bg-[var(--accent-soft)]" : ""}`}
                  key={row.id}
                >
                  <td className="border-b border-[var(--border-hairline)] p-0 align-middle">
                    <button
                      aria-label={`Select ${row.name}; double click to open record.`}
                      className={cellButtonClass}
                      onClick={() => scheduleSelectRecord(row)}
                      onDoubleClick={() => openRecordFromDoubleClick(row)}
                      onKeyDown={(event) => handleRowKeyDown(event, row)}
                      type="button"
                    >
                      <span className="block max-w-[28ch] truncate font-semibold text-[var(--text-primary)] transition group-hover:text-[var(--accent)]">{row.name}</span>
                      <span className="mt-1 block text-xs text-[var(--text-secondary)]">{row.sourceLabel}</span>
                    </button>
                  </td>
                  <td className="border-b border-[var(--border-hairline)] p-0 align-middle text-[var(--text-secondary)]">
                    <button className={cellButtonClass} onClick={() => scheduleSelectRecord(row)} onDoubleClick={() => openRecordFromDoubleClick(row)} type="button">
                      <span className="line-clamp-2 max-w-[28ch]">{row.detail || "No detail captured"}</span>
                      <span className="mt-1 block text-xs text-[var(--text-muted)]">{row.valueLabel}</span>
                    </button>
                  </td>
                  <td className="border-b border-[var(--border-hairline)] p-0 align-middle">
                    <button className={cellButtonClass} onClick={() => scheduleSelectRecord(row)} onDoubleClick={() => openRecordFromDoubleClick(row)} type="button">
                      <Tag>{humanizeTag(row.personaTag)}</Tag>
                    </button>
                  </td>
                  <td className="border-b border-[var(--border-hairline)] p-0 align-middle">
                    <button className={cellButtonClass} onClick={() => scheduleSelectRecord(row)} onDoubleClick={() => openRecordFromDoubleClick(row)} type="button">
                      <span className="flex items-center gap-2">
                        {typeof row.score === "number" ? <ScoreRing score={row.score} /> : null}
                        <MissingBadge missingFields={row.missingFields} />
                      </span>
                    </button>
                  </td>
                  <td className="border-b border-[var(--border-hairline)] p-0 align-middle">
                    <button className={cellButtonClass} onClick={() => scheduleSelectRecord(row)} onDoubleClick={() => openRecordFromDoubleClick(row)} type="button">
                      <StatusPill tone={statusTone(row.status)}>{row.status}</StatusPill>
                    </button>
                  </td>
                  <td className="border-b border-[var(--border-hairline)] p-0 align-middle">
                    <button className={cellButtonClass} onClick={() => scheduleSelectRecord(row)} onDoubleClick={() => openRecordFromDoubleClick(row)} type="button">
                      <span className="block font-medium text-[var(--text-primary)]">{formatRelative(row.updated)}</span>
                      <span className="mt-1 block text-xs text-[var(--text-muted)]">{formatCrmDate(row.updated)}</span>
                    </button>
                  </td>
                  <td className="border-b border-[var(--border-hairline)] p-0 align-middle">
                    <button className={cellButtonClass} onClick={() => scheduleSelectRecord(row)} onDoubleClick={() => openRecordFromDoubleClick(row)} type="button">
                      <span className="flex items-center gap-2">
                        <span className="flex h-7 w-7 items-center justify-center rounded-full border border-[var(--accent-border-strong)] bg-[var(--accent-soft)] font-mono text-[11px] font-semibold text-[var(--accent)]">
                          {initials(row.owner)}
                        </span>
                        <span className="max-w-[9ch] truncate text-sm text-[var(--text-secondary)]">{row.owner}</span>
                      </span>
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {visibleRows.length === 0 ? (
          <div className="border-t border-[var(--border-hairline)] px-5 py-8">
            <EmptyState
              title={activeView === "all-records" ? `No ${objectLabel.toLowerCase()} found` : `No ${activeViewLabel.toLowerCase()} records found`}
              detail={normalizedQuery ? `No records match "${query.trim()}". Clear the search or try another term.` : "No records match this CRM view yet."}
            />
          </div>
        ) : null}
      </div>

      <div className="flex flex-col gap-3 border-t border-[var(--border-hairline)] bg-[var(--surface-inset)] px-4 py-3 text-sm text-[var(--text-secondary)] lg:flex-row lg:items-center lg:justify-between">
        <div>
          {filteredRows.length === 0 ? "0" : `${startIndex + 1}-${endIndex}`} of {filteredRows.length.toLocaleString("en-US")} records
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[var(--border-hairline)] bg-[var(--surface-panel)] transition hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:opacity-40"
            disabled={currentPage <= 1}
            onClick={() => setPage((value) => Math.max(1, value - 1))}
            type="button"
          >
            <span className="sr-only">Previous page</span>
            <ChevronLeftIcon />
          </button>
          {pageNumbers(pageCount).map((item) =>
            typeof item === "number" ? (
              <button
                aria-current={currentPage === item ? "page" : undefined}
                className={`h-8 min-w-8 rounded-md border px-2 font-mono text-xs transition ${
                  currentPage === item
                    ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]"
                    : "border-transparent text-[var(--text-secondary)] hover:border-[var(--border-hairline)] hover:bg-[var(--surface-panel)]"
                }`}
                key={item}
                onClick={() => setPage(item)}
                type="button"
              >
                {item}
              </button>
            ) : (
              <span className="px-1 text-[var(--text-muted)]" key={item}>
                ...
              </span>
            ),
          )}
          <button
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[var(--border-hairline)] bg-[var(--surface-panel)] transition hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:opacity-40"
            disabled={currentPage >= pageCount}
            onClick={() => setPage((value) => Math.min(pageCount, value + 1))}
            type="button"
          >
            <span className="sr-only">Next page</span>
            <ChevronRightIcon />
          </button>
          <label className="ml-1 flex items-center gap-2">
            <span>Rows:</span>
            <select
              className="h-8 cursor-pointer rounded-md border border-[var(--border-hairline)] bg-[var(--surface-panel)] px-2 text-sm font-semibold text-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
              onChange={(event) => {
                setPageSize(Number(event.target.value));
                resetPage();
              }}
              value={pageSize}
            >
              {PAGE_SIZES.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
    </>
  );
}

function FilterSelect({
  label,
  onChange,
  options,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  options: string[];
  value: string;
}) {
  return (
    <label className="block">
      <span className="sr-only">{label}</span>
      <select
        className="h-10 w-full cursor-pointer rounded-md border border-[var(--border-hairline)] bg-[var(--surface-panel)] px-3 text-sm font-semibold text-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        <option value="all">{label}: All</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function ScoreRing({ score }: { score: number }) {
  const tone =
    score >= 75
      ? "text-[var(--ok)] border-[var(--ok-border)]"
      : score >= 55
        ? "text-[var(--warn)] border-[var(--warn-border)]"
        : "text-[var(--priority-bright)] border-[var(--priority-border)]";
  return (
    <span className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 bg-[var(--surface-soft)] font-mono text-xs font-semibold ${tone}`}>
      {score}
    </span>
  );
}

function MissingBadge({ missingFields }: { missingFields: string[] }) {
  if (missingFields.length === 0) {
    return <span className="rounded-md border border-[var(--ok-border)] bg-[var(--ok-soft)] px-2 py-1 text-[11px] font-semibold leading-none text-[var(--ok)]">Clean</span>;
  }

  return (
    <span className="rounded-md border border-[var(--warn-border)] bg-[var(--warn-soft)] px-2 py-1 text-[11px] font-semibold leading-none text-[var(--warn-text)]" title={missingFields.map(formatMissingField).join(", ")}>
      {missingFields.length} missing
    </span>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex max-w-[16ch] items-center rounded-md border border-[var(--accent-border-strong)] bg-[var(--accent-soft)] px-2 py-1 text-[11px] font-semibold leading-none text-[var(--accent-contrast)]">
      <span className="truncate">{children}</span>
    </span>
  );
}

function viewHref(objectHref: string, activeView: CrmListViewKey) {
  if (activeView === "all-records") return objectHref;
  return `${objectHref}?view=${activeView}`;
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

function uniqueSorted(values: string[]) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function humanizeTag(value: string) {
  return value
    .replace(/^persona_/, "")
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function initials(value: string) {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "GE";
  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function formatMissingField(value: string) {
  return value.replaceAll("_", " ");
}

function formatRelative(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const diffMs = Date.now() - date.getTime();
  const diffHours = Math.max(1, Math.round(diffMs / 36e5));
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${Math.round(diffHours / 24)}d ago`;
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

function pageNumbers(pageCount: number): Array<number | string> {
  if (pageCount <= 5) return Array.from({ length: pageCount }, (_, index) => index + 1);
  return [1, 2, 3, "gap", pageCount];
}

function SearchIcon() {
  return (
    <svg aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 20 20">
      <circle cx="9" cy="9" r="6" />
      <path d="m18 18-4.5-4.5" strokeLinecap="round" />
    </svg>
  );
}

function SortIcon() {
  return (
    <svg aria-hidden className="h-3 w-3 text-[var(--text-muted)]" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 16 16">
      <path d="m5 6 3-3 3 3" />
      <path d="m11 10-3 3-3-3" />
    </svg>
  );
}

function ChevronLeftIcon() {
  return (
    <svg aria-hidden className="h-4 w-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 20 20">
      <path d="m12 5-5 5 5 5" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg aria-hidden className="h-4 w-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 20 20">
      <path d="m8 5 5 5-5 5" />
    </svg>
  );
}
