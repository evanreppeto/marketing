"use client";

import { useMemo, useState } from "react";

import { DataTable } from "../../_components/data-table";
import { EmptyState, StatusPill } from "../../_components/page-header";
import { type CrmPipelineRow } from "@/lib/crm/read-model";

type ScoreFilter = "all" | "high" | "medium" | "low" | "missing-data";

const PAGE_SIZES = [8, 16, 32];

const SCORE_FILTERS: Array<{ key: ScoreFilter; label: string }> = [
  { key: "all", label: "All scores" },
  { key: "high", label: "High score" },
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
  const [query, setQuery] = useState("");
  const [scoreFilter, setScoreFilter] = useState<ScoreFilter>("all");
  const [personaFilter, setPersonaFilter] = useState("all");
  const [tagFilter, setTagFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(8);
  const normalizedQuery = query.trim().toLowerCase();
  const personaOptions = useMemo(() => uniqueSorted(rows.map((row) => row.personaTag)), [rows]);
  const tagOptions = useMemo(
    () =>
      uniqueSorted(
        rows.flatMap((row) => [
          row.urgencyTag,
          row.sourceTag,
          row.lifecycleTag,
          ...row.serviceTags,
          ...row.missingTags,
        ]),
      ),
    [rows],
  );

  const filtered = useMemo(() => {
    return rows.filter((row) => {
      const matchesScore = matchesScoreFilter(row, scoreFilter);
      const matchesPersona = personaFilter === "all" || row.personaTag === personaFilter;
      const rowTags = new Set([row.urgencyTag, row.sourceTag, row.lifecycleTag, ...row.serviceTags, ...row.missingTags]);
      const matchesTag = tagFilter === "all" || rowTags.has(tagFilter);
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

      return matchesScore && matchesPersona && matchesTag && (!normalizedQuery || searchable.includes(normalizedQuery));
    });
  }, [normalizedQuery, personaFilter, rows, scoreFilter, tagFilter]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const startIndex = filtered.length === 0 ? 0 : (currentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, filtered.length);
  const visibleRows = filtered.slice(startIndex, endIndex);

  function resetPage() {
    setPage(1);
  }

  return (
    <>
      <div className="border-b border-[var(--border-hairline)] bg-[var(--surface-inset)] px-5 py-4">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(520px,1fr)] xl:items-start">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="signal-eyebrow">Scoring and tags</span>
              <StatusPill tone="amber">Outbound locked</StatusPill>
              <StatusPill tone="blue">{rows.length} records</StatusPill>
            </div>
            <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
              Showing {startIndex + (filtered.length > 0 ? 1 : 0)}-{endIndex} of {filtered.length}
              {filtered.length === rows.length ? "" : ` matched from ${rows.length}`} CRM pipeline records.
            </p>
          </div>

          <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_150px_150px_110px]">
            <label className="relative block">
              <span className="sr-only">Search CRM pipeline</span>
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
                aria-label="Search CRM pipeline"
                className="h-11 w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-panel)] py-2 pl-9 pr-3 text-sm font-semibold text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
                onChange={(event) => {
                  setQuery(event.target.value);
                  resetPage();
                }}
                placeholder="Search records or tags..."
                type="search"
                value={query}
              />
            </label>

            <FilterSelect
              label="Persona tag"
              onChange={(value) => {
                setPersonaFilter(value);
                resetPage();
              }}
              options={personaOptions}
              value={personaFilter}
            />
            <FilterSelect
              label="Service/source tag"
              onChange={(value) => {
                setTagFilter(value);
                resetPage();
              }}
              options={tagOptions}
              value={tagFilter}
            />
            <label className="block">
              <span className="sr-only">CRM rows per page</span>
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

        <div className="mt-4 flex flex-wrap gap-2">
          {SCORE_FILTERS.map((item) => {
            const selected = scoreFilter === item.key;
            const count = rows.filter((row) => matchesScoreFilter(row, item.key)).length;
            return (
              <button
                aria-pressed={selected}
                className={`inline-flex min-h-9 cursor-pointer items-center rounded-md border px-3 text-sm font-semibold transition hover:-translate-y-0.5 active:translate-y-px ${
                  selected
                    ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text-primary)]"
                    : "border-[var(--border-hairline)] bg-[var(--surface-panel)] text-[var(--text-secondary)] hover:border-[var(--accent)] hover:bg-[var(--surface-raised)]"
                }`}
                key={item.key}
                onClick={() => {
                  setScoreFilter(item.key);
                  resetPage();
                }}
                type="button"
              >
                {item.label}
                <span className="ml-2 rounded-full bg-current/10 px-1.5 text-xs">{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      <DataTable
        rows={visibleRows}
        rowKey={(row) => row.id}
        rowHref={(row) => `/crm?tab=record&view=${activeView}&selected=${row.id}`}
        minWidth="min-w-[1180px]"
        isSelected={(row) => selectedRecordId === row.id}
        columns={[
          {
            key: "record",
            header: "Record",
            cellClassName: "max-w-[30ch]",
            cell: (row) => (
              <>
                <div className="line-clamp-1 font-semibold text-[var(--text-primary)] transition group-hover:text-[var(--accent)]">{row.record}</div>
                <div className="mt-1 line-clamp-1 text-xs text-[var(--text-muted)]">{row.account}</div>
              </>
            ),
          },
          {
            key: "score",
            header: "Score",
            cell: (row) => <StatusPill tone={scoreTone(row.score)}>{row.score}/100</StatusPill>,
          },
          {
            key: "persona",
            header: "Persona",
            cellClassName: "max-w-[18ch]",
            cell: (row) => <TagList tags={[row.personaTag]} tone="blue" />,
          },
          {
            key: "tags",
            header: "Tags",
            cellClassName: "max-w-[44ch]",
            cell: (row) => (
              <TagList
                tags={[row.urgencyTag, row.lifecycleTag, row.sourceTag, ...row.serviceTags, ...row.missingTags].slice(0, 7)}
                tone={row.missingTags.length > 0 ? "amber" : "gray"}
              />
            ),
          },
          { key: "stage", header: "Stage", cell: (row) => <StatusPill tone={row.tone}>{row.stage}</StatusPill> },
          {
            key: "next",
            header: "Next best action",
            cellClassName: "max-w-[34ch] text-[var(--text-secondary)]",
            cell: (row) => (
              <>
                <div className="line-clamp-2 font-medium">{row.nextStep}</div>
                <div className="mt-1 text-xs text-[var(--text-muted)]">{formatCrmDate(row.updated)}</div>
              </>
            ),
          },
        ]}
        emptyState={
          <EmptyState
            title="No matching CRM records"
            detail="Clear the search, score band, persona, or tag filter to widen the pipeline view."
          />
        }
      />

      <div className="flex flex-col gap-3 border-t border-[var(--border-hairline)] bg-[var(--surface-inset)] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm font-semibold text-[var(--text-secondary)]">
          Page {currentPage} of {pageCount}
        </div>
        <div className="flex gap-2">
          <button
            className="min-h-10 cursor-pointer rounded-md border border-[var(--border-hairline)] bg-[var(--surface-panel)] px-4 text-sm font-bold text-[var(--text-primary)] transition hover:border-[var(--accent)] hover:bg-[var(--surface-raised)] disabled:cursor-not-allowed disabled:opacity-45"
            disabled={currentPage <= 1}
            onClick={() => setPage((value) => Math.max(1, value - 1))}
            type="button"
          >
            Previous
          </button>
          <button
            className="min-h-10 cursor-pointer rounded-md border border-[var(--border-hairline)] bg-[var(--surface-panel)] px-4 text-sm font-bold text-[var(--text-primary)] transition hover:border-[var(--accent)] hover:bg-[var(--surface-raised)] disabled:cursor-not-allowed disabled:opacity-45"
            disabled={currentPage >= pageCount}
            onClick={() => setPage((value) => Math.min(pageCount, value + 1))}
            type="button"
          >
            Next
          </button>
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
        className="h-11 w-full cursor-pointer rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-panel)] px-3 text-sm font-bold text-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        <option value="all">{label}</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {humanizeTag(option)}
          </option>
        ))}
      </select>
    </label>
  );
}

function TagList({ tags, tone }: { tags: string[]; tone: "amber" | "blue" | "gray" }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {tags.map((tag) => (
        <span
          className={`rounded-md border px-2 py-1 text-[11px] font-semibold leading-none ${
            tone === "blue"
              ? "border-[oklch(0.74_0.115_232/0.32)] bg-[var(--accent-soft)] text-[var(--chicago-blue-soft)]"
              : tone === "amber"
                ? "border-[oklch(0.82_0.13_85/0.32)] bg-[oklch(0.82_0.13_85/0.1)] text-[oklch(0.9_0.09_85)]"
                : "border-[var(--border-hairline)] bg-[var(--surface-soft)] text-[var(--text-secondary)]"
          }`}
          key={tag}
        >
          {humanizeTag(tag)}
        </span>
      ))}
    </div>
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

function scoreTone(score: number): "amber" | "green" | "red" | "blue" | "gray" {
  if (score >= 80) return "green";
  if (score >= 60) return "blue";
  if (score >= 40) return "amber";
  return "red";
}

function uniqueSorted(values: string[]) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => humanizeTag(a).localeCompare(humanizeTag(b)));
}

function humanizeTag(value: string) {
  return value
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
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
