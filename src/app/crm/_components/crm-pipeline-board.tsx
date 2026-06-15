"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { EmptyState, StatusPill } from "../../_components/page-header";
import { type CrmPipelineRow } from "@/lib/crm/read-model";

type ScoreFilter = "all" | "high" | "medium" | "low" | "missing-data";

const PAGE_SIZES = [8, 16, 25];

const SCORE_FILTERS: Array<{ key: ScoreFilter; label: string }> = [
  { key: "all", label: "All" },
  { key: "high", label: "High" },
  { key: "medium", label: "Medium" },
  { key: "low", label: "Low" },
  { key: "missing-data", label: "Needs data" },
];

export function CrmPipelineBoard({
  activeView,
  rows,
  selectedRecordId,
}: {
  activeView: string;
  rows: CrmPipelineRow[];
  selectedRecordId: string | null;
}) {
  const router = useRouter();
  const clickTimeoutRef = useRef<number | null>(null);
  const [query, setQuery] = useState("");
  const [scoreFilter, setScoreFilter] = useState<ScoreFilter>("all");
  const [personaFilter, setPersonaFilter] = useState("all");
  const [ownerFilter, setOwnerFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(8);
  const normalizedQuery = query.trim().toLowerCase();
  const personaOptions = useMemo(() => uniqueSorted(rows.map((row) => row.personaTag)), [rows]);
  const ownerOptions = useMemo(() => uniqueSorted(rows.map((row) => row.owner)), [rows]);

  const filtered = useMemo(() => {
    return rows.filter((row) => {
      const matchesScore = matchesScoreFilter(row, scoreFilter);
      const matchesPersona = personaFilter === "all" || row.personaTag === personaFilter;
      const matchesOwner = ownerFilter === "all" || row.owner === ownerFilter;
      const searchable = [
        row.record,
        row.account,
        row.type,
        row.stage,
        row.owner,
        row.value,
        row.nextStep,
        row.personaTag,
        row.urgencyTag,
        row.sourceTag,
        row.lifecycleTag,
        ...row.serviceTags,
        ...row.missingTags,
      ]
        .join(" ")
        .toLowerCase();

      return matchesScore && matchesPersona && matchesOwner && (!normalizedQuery || searchable.includes(normalizedQuery));
    });
  }, [normalizedQuery, ownerFilter, personaFilter, rows, scoreFilter]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const startIndex = filtered.length === 0 ? 0 : (currentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, filtered.length);
  const visibleRows = filtered.slice(startIndex, endIndex);

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

  function selectedHref(row: CrmPipelineRow) {
    const params = new URLSearchParams();
    if (activeView !== "needs-action") {
      params.set("view", activeView);
    }
    params.set("selected", row.id);
    return `/crm?${params.toString()}`;
  }

  function selectRecord(row: CrmPipelineRow) {
    router.replace(selectedHref(row), { scroll: false });
  }

  function openRecord(row: CrmPipelineRow) {
    router.push(row.href);
  }

  function scheduleSelectRecord(row: CrmPipelineRow) {
    if (clickTimeoutRef.current) {
      window.clearTimeout(clickTimeoutRef.current);
    }

    clickTimeoutRef.current = window.setTimeout(() => {
      selectRecord(row);
      clickTimeoutRef.current = null;
    }, 180);
  }

  function openRecordFromDoubleClick(row: CrmPipelineRow) {
    if (clickTimeoutRef.current) {
      window.clearTimeout(clickTimeoutRef.current);
      clickTimeoutRef.current = null;
    }

    openRecord(row);
  }

  function handleRowKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, row: CrmPipelineRow) {
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
        <div className="grid gap-2 xl:grid-cols-[minmax(220px,0.8fr)_150px_140px_140px_112px]">
          <label className="relative block">
            <span className="sr-only">Search leads</span>
            <SearchIcon />
            <input
              aria-label="Search leads"
              className="h-10 w-full rounded-md border border-[var(--border-hairline)] bg-[var(--surface-panel)] py-2 pl-9 pr-3 text-sm font-medium text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
              onChange={(event) => {
                setQuery(event.target.value);
                resetPage();
              }}
              placeholder="Search leads..."
              type="search"
              value={query}
            />
          </label>

          <label className="block">
            <span className="sr-only">List view</span>
            <select
              className="h-10 w-full cursor-pointer rounded-md border border-[var(--border-hairline)] bg-[var(--surface-panel)] px-3 text-sm font-semibold text-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
              value={activeView}
              onChange={(event) => {
                const nextView = event.target.value;
                window.location.href = nextView === "needs-action" ? "/crm" : `/crm?view=${nextView}`;
              }}
            >
              <option value="needs-action">View: Needs Action</option>
              <option value="new">View: New</option>
              <option value="qualified">View: Qualified</option>
              <option value="scheduled">View: Scheduled</option>
              <option value="closed">View: Closed</option>
            </select>
          </label>

          <FilterSelect
            label="Persona"
            onChange={(value) => {
              setPersonaFilter(value);
              resetPage();
            }}
            options={personaOptions}
            value={personaFilter}
          />

          <label className="block">
            <span className="sr-only">Score</span>
            <select
              className="h-10 w-full cursor-pointer rounded-md border border-[var(--border-hairline)] bg-[var(--surface-panel)] px-3 text-sm font-semibold text-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
              onChange={(event) => {
                setScoreFilter(event.target.value as ScoreFilter);
                resetPage();
              }}
              value={scoreFilter}
            >
              {SCORE_FILTERS.map((filter) => (
                <option key={filter.key} value={filter.key}>
                  Score: {filter.label}
                </option>
              ))}
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
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[1120px] border-separate border-spacing-0 text-left text-sm">
          <thead>
            <tr className="bg-[var(--surface-inset)] text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">
              {["Lead", "Account / Asset", "Persona", "Score", "Stage", "Last activity", "Next step", "Owner"].map((header) => (
                <th className="border-b border-[var(--border-hairline)] px-3 py-3" key={header} scope="col">
                  <span className="inline-flex items-center gap-1">
                    {header}
                    <SortIcon />
                  </span>
                </th>
              ))}
              <th className="w-10 border-b border-[var(--border-hairline)] px-3 py-3">
                <span className="sr-only">Actions</span>
              </th>
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
                      aria-label={`Select ${row.record}; double click to open record.`}
                      className={cellButtonClass}
                      onClick={() => scheduleSelectRecord(row)}
                      onDoubleClick={() => openRecordFromDoubleClick(row)}
                      onKeyDown={(event) => handleRowKeyDown(event, row)}
                      type="button"
                    >
                      <span className="block font-semibold text-[var(--text-primary)] transition group-hover:text-[var(--accent)]">{row.record}</span>
                      <span className="mt-1 block text-xs text-[var(--text-secondary)]">{row.account}</span>
                    </button>
                  </td>
                  <td className="border-b border-[var(--border-hairline)] p-0 align-middle text-[var(--text-secondary)]">
                    <button className={cellButtonClass} onClick={() => scheduleSelectRecord(row)} onDoubleClick={() => openRecordFromDoubleClick(row)} type="button">
                      <span className="block max-w-[18ch] truncate">{row.account}</span>
                      <span className="mt-1 block text-xs text-[var(--text-muted)]">{row.objectType === "partner" ? "Partner account" : row.type}</span>
                    </button>
                  </td>
                  <td className="border-b border-[var(--border-hairline)] p-0 align-middle">
                    <button className={cellButtonClass} onClick={() => scheduleSelectRecord(row)} onDoubleClick={() => openRecordFromDoubleClick(row)} type="button">
                      <Tag tone="blue">{humanizeTag(row.personaTag)}</Tag>
                    </button>
                  </td>
                  <td className="border-b border-[var(--border-hairline)] p-0 align-middle">
                    <button className={cellButtonClass} onClick={() => scheduleSelectRecord(row)} onDoubleClick={() => openRecordFromDoubleClick(row)} type="button">
                      <ScoreRing score={row.score} />
                    </button>
                  </td>
                  <td className="border-b border-[var(--border-hairline)] p-0 align-middle">
                    <button className={cellButtonClass} onClick={() => scheduleSelectRecord(row)} onDoubleClick={() => openRecordFromDoubleClick(row)} type="button">
                      <StatusPill tone={row.tone}>{row.stage}</StatusPill>
                    </button>
                  </td>
                  <td className="border-b border-[var(--border-hairline)] p-0 align-middle">
                    <button className={cellButtonClass} onClick={() => scheduleSelectRecord(row)} onDoubleClick={() => openRecordFromDoubleClick(row)} type="button">
                      <span className="block font-medium text-[var(--text-primary)]">{formatRelative(row.updated)}</span>
                      <span className="mt-1 block text-xs text-[var(--text-muted)]">{humanizeTag(row.sourceTag)}</span>
                    </button>
                  </td>
                  <td className="border-b border-[var(--border-hairline)] p-0 align-middle text-[var(--text-secondary)]">
                    <button className={cellButtonClass} onClick={() => scheduleSelectRecord(row)} onDoubleClick={() => openRecordFromDoubleClick(row)} type="button">
                      <span className="line-clamp-2 max-w-[22ch]">{row.nextStep}</span>
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
                  <td className="border-b border-[var(--border-hairline)] px-3 py-3 align-middle text-right text-[var(--text-muted)]">
                    <Link
                      className="inline-flex min-h-8 items-center rounded-md border border-[var(--border-hairline)] px-2 text-xs font-semibold text-[var(--text-secondary)] transition hover:border-[var(--accent)] hover:bg-[var(--surface-inset)] hover:text-[var(--accent)]"
                      href={row.href}
                      onClick={(event) => event.stopPropagation()}
                    >
                      Open
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {visibleRows.length === 0 ? (
          <div className="border-t border-[var(--border-hairline)] px-5 py-8">
            <EmptyState title="No matching CRM records" detail="Clear the search, score, persona, or owner filter to widen the working list." />
          </div>
        ) : null}
      </div>

      <div className="flex flex-col gap-3 border-t border-[var(--border-hairline)] bg-[var(--surface-inset)] px-4 py-3 text-sm text-[var(--text-secondary)] lg:flex-row lg:items-center lg:justify-between">
        <div>
          {filtered.length === 0 ? "0" : `${startIndex + 1}-${endIndex}`} of {filtered.length.toLocaleString("en-US")}
          {filtered.length === rows.length ? "" : ` matched from ${rows.length.toLocaleString("en-US")}`}
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
            <span>Rows per page:</span>
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
            {humanizeTag(option)}
          </option>
        ))}
      </select>
    </label>
  );
}

function ScoreRing({ score }: { score: number }) {
  const tone = score >= 75 ? "text-[var(--ok)] border-[var(--ok-border)]" : score >= 55 ? "text-[var(--warn)] border-[var(--warn-border)]" : "text-[var(--priority-bright)] border-[var(--priority-border)]";
  return (
    <span className={`inline-flex h-9 w-9 items-center justify-center rounded-full border-2 bg-[var(--surface-soft)] font-mono text-xs font-semibold ${tone}`}>
      {score}
    </span>
  );
}

function Tag({ children, tone }: { children: React.ReactNode; tone: "blue" | "gray" }) {
  return (
    <span
      className={`inline-flex max-w-[16ch] items-center rounded-md border px-2 py-1 text-[11px] font-semibold leading-none ${
        tone === "blue"
          ? "border-[var(--accent-border-strong)] bg-[var(--accent-soft)] text-[var(--accent-contrast)]"
          : "border-[var(--border-hairline)] bg-[var(--surface-soft)] text-[var(--text-secondary)]"
      }`}
    >
      <span className="truncate">{children}</span>
    </span>
  );
}

function matchesScoreFilter(row: CrmPipelineRow, filter: ScoreFilter) {
  if (filter === "all") return true;
  if (filter === "high") return row.score >= 75;
  if (filter === "medium") return row.score >= 50 && row.score < 75;
  if (filter === "low") return row.score < 50;
  if (filter === "missing-data") return row.missingTags.length > 0;
  return true;
}

function uniqueSorted(values: string[]) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => humanizeTag(a).localeCompare(humanizeTag(b)));
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
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");
}

function formatRelative(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const diffMs = Date.now() - date.getTime();
  const diffHours = Math.max(1, Math.round(diffMs / 36e5));
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${Math.round(diffHours / 24)}d ago`;
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
