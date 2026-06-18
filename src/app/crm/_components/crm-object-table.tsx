"use client";

import Link from "next/link";
import FormControl from "@mui/material/FormControl";
import MenuItem from "@mui/material/MenuItem";
import Select, { type SelectChangeEvent } from "@mui/material/Select";
import { ArrowRight, ChevronLeft, ChevronRight, ChevronsUpDown, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { EmptyState, StatusPill, buttonClasses } from "../../_components/page-header";
import { CRM_FIELD_PRESETS, type CrmObjectKey, type CrmTableColumnKey } from "./crm-field-presets";
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
  objectKey,
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
  objectKey: CrmObjectKey;
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
  const [personaFilter, setPersonaFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(8);
  const normalizedQuery = query.trim().toLowerCase();
  const personaOptions = useMemo(() => uniqueSorted(rows.map((row) => humanizeTag(row.personaTag))), [rows]);
  const tableColumns = useMemo(
    () => getTableColumns({
      objectKey,
      primaryField,
      secondaryField,
    }),
    [objectKey, primaryField, secondaryField],
  );

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      const matchesData =
        dataFilter === "all" ||
        (dataFilter === "missing" && row.missingFields.length > 0) ||
        (dataFilter === "complete" && row.missingFields.length === 0);
      const matchesPersona = personaFilter === "all" || humanizeTag(row.personaTag) === personaFilter;
      const searchable = [
        row.id,
        row.name,
        row.detail,
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

      return matchesData && matchesPersona && (!normalizedQuery || searchable.includes(normalizedQuery));
    });
  }, [dataFilter, normalizedQuery, personaFilter, rows]);

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
    }, 60);
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
        <div className="grid gap-2 rounded-md border border-[var(--border-hairline)] bg-[var(--surface-panel)] p-2 xl:grid-cols-[minmax(260px,1fr)_180px_160px_150px]">
          <label className="relative block">
            <span className="sr-only">Search {objectLabel}</span>
            <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" strokeWidth={1.9} />
            <input
              aria-label={`Search ${objectLabel}`}
              className="h-10 w-full rounded-md border border-[var(--border-hairline)] bg-[var(--surface-inset)] py-2 pl-9 pr-3 text-sm font-medium text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
              onChange={(event) => {
                setQuery(event.target.value);
                resetPage();
              }}
              placeholder={`Search ${objectLabel.toLowerCase()}...`}
              type="search"
              value={query}
            />
          </label>

          <SignalSelect
            label="List view"
            onChange={(value) => {
              window.location.href = value;
            }}
            value={viewHref(objectHref, activeView)}
          >
            {views.map((view) => (
              <MenuItem key={view.key} value={view.href}>
                View: {view.label}
              </MenuItem>
            ))}
          </SignalSelect>

          <SignalSelect
            label="Data quality"
            onChange={(value) => {
              setDataFilter(value as DataFilter);
              resetPage();
            }}
            value={dataFilter}
          >
            <MenuItem value="all">Data: All</MenuItem>
            <MenuItem value="missing">Data: Missing</MenuItem>
            <MenuItem value="complete">Data: Complete</MenuItem>
          </SignalSelect>

          <FilterSelect
            label="Persona"
            onChange={(value) => {
              setPersonaFilter(value);
              resetPage();
            }}
            options={personaOptions}
            value={personaFilter}
          />
        </div>

        <div className="mt-3 flex flex-col gap-2 text-sm text-[var(--text-secondary)] lg:flex-row lg:items-center lg:justify-between">
          <p>
            {activeViewDescription} Showing {filteredRows.length === 0 ? "0" : `${startIndex + 1}-${endIndex}`} of{" "}
            {filteredRows.length.toLocaleString("en-US")}
            {filteredRows.length === rows.length ? "" : ` matched from ${rows.length.toLocaleString("en-US")}`}.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {views.map((view) => (
              <Link
                aria-current={activeView === view.key ? "page" : undefined}
                className={`relative inline-flex min-h-8 items-center gap-2 rounded px-2.5 text-xs font-semibold transition duration-150 ${
                  activeView === view.key
                    ? "text-[var(--text-primary)]"
                    : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                }`}
                href={view.href}
                key={view.key}
                aria-label={view.description}
              >
                {view.label}
                <span className="font-mono text-[var(--text-muted)]">{view.count}</span>
                {activeView === view.key ? <span aria-hidden className="absolute inset-x-2 bottom-0 h-px bg-[var(--accent)]" /> : null}
              </Link>
            ))}
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] border-separate border-spacing-0 text-left text-sm">
          <thead>
            <tr className="bg-[var(--surface-inset)] text-[11px] font-semibold text-[var(--text-muted)]">
              {tableColumns.map((column) => (
                <th className="border-b border-[var(--border-hairline)] px-3 py-3" key={column.key} scope="col">
                  <span className="inline-flex items-center gap-1">
                    {column.header}
                    <ChevronsUpDown aria-hidden className="h-3.5 w-3.5 text-[var(--text-muted)]" strokeWidth={1.8} />
                  </span>
                </th>
              ))}
              <th className="w-9 border-b border-[var(--border-hairline)] px-2 py-3" aria-hidden />
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => {
              const selected = selectedRecordId === row.id;
              const cellButtonClass =
                "block h-full w-full cursor-pointer bg-transparent px-3 py-3 text-left outline-none transition-[background-color,color] duration-200 ease-out focus-visible:bg-[var(--surface-raised)]";
              return (
                <tr
                  aria-current={selected ? "page" : undefined}
                  className={`group relative cursor-pointer transition-colors duration-150 ease-out hover:bg-[var(--surface-raised)] ${
                    selected ? "bg-[rgba(255,255,255,0.05)]" : ""
                  }`}
                  key={row.id}
                >
                  {tableColumns.map((column, index) => (
                    <td className={`border-b border-[var(--border-hairline)] p-0 align-middle ${index === 0 ? "relative" : ""}`} key={column.key}>
                      {index === 0 && selected ? <span aria-hidden className="absolute left-0 top-0 h-full w-px bg-[var(--accent)]" /> : null}
                      <button
                        aria-label={`Select ${row.name}`}
                        className={cellButtonClass}
                        onClick={() => scheduleSelectRecord(row)}
                        onDoubleClick={() => openRecordFromDoubleClick(row)}
                        onKeyDown={(event) => handleRowKeyDown(event, row)}
                        type="button"
                      >
                        {renderColumnContent(column.key, row, selected)}
                      </button>
                    </td>
                  ))}
                  <td className="border-b border-[var(--border-hairline)] p-0 align-middle">
                    <button
                      aria-label={`Open ${row.name}`}
                      className="flex h-full w-full cursor-pointer items-center justify-center px-2 text-[var(--text-muted)] transition-colors duration-300 group-hover:text-[var(--accent)]"
                      onClick={() => openRecord(row)}
                      type="button"
                    >
                      <ArrowRight
                        aria-hidden
                        className="h-4 w-4 shrink-0 -translate-x-0.5 opacity-0 transition-all duration-200 ease-out group-hover:translate-x-0 group-hover:opacity-100"
                        strokeWidth={1.9}
                      />
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
            className={buttonClasses({ variant: "ghost", size: "sm", className: "h-8 min-h-8 w-8 px-0" })}
            disabled={currentPage <= 1}
            onClick={() => setPage((value) => Math.max(1, value - 1))}
            type="button"
          >
            <span className="sr-only">Previous page</span>
            <ChevronLeft aria-hidden className="h-4 w-4" strokeWidth={1.9} />
          </button>
          {pageNumbers(pageCount).map((item) =>
            typeof item === "number" ? (
              <button
                aria-current={currentPage === item ? "page" : undefined}
                className={`h-8 min-w-8 rounded border px-2 font-mono text-xs transition ${
                  currentPage === item
                    ? "border-transparent bg-[rgba(255,255,255,0.06)] text-[var(--accent)]"
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
            className={buttonClasses({ variant: "ghost", size: "sm", className: "h-8 min-h-8 w-8 px-0" })}
            disabled={currentPage >= pageCount}
            onClick={() => setPage((value) => Math.min(pageCount, value + 1))}
            type="button"
          >
            <span className="sr-only">Next page</span>
            <ChevronRight aria-hidden className="h-4 w-4" strokeWidth={1.9} />
          </button>
          <div className="ml-1 flex items-center gap-2">
            <span>Rows:</span>
            <div className="w-20">
              <SignalSelect
                label="Rows per page"
                onChange={(value) => {
                  setPageSize(Number(value));
                  resetPage();
                }}
                compact
                value={String(pageSize)}
              >
                {PAGE_SIZES.map((size) => (
                  <MenuItem key={size} value={String(size)}>
                    {size}
                  </MenuItem>
                ))}
              </SignalSelect>
            </div>
          </div>
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
    <SignalSelect label={label} onChange={onChange} value={value}>
      <MenuItem value="all">{label}: All</MenuItem>
      {options.map((option) => (
        <MenuItem key={option} value={option}>
          {option}
        </MenuItem>
      ))}
    </SignalSelect>
  );
}

function getTableColumns({
  objectKey,
  primaryField,
  secondaryField,
}: {
  objectKey: CrmObjectKey;
  primaryField: string;
  secondaryField: string;
}) {
  const headers: Record<CrmTableColumnKey, string> = {
    links: "Links",
    nextAction: "Next action",
    persona: "Persona",
    primary: primaryField,
    score: "Score",
    secondary: secondaryField,
    status: "Status",
    updated: "Updated",
    value: "Value",
  };

  return CRM_FIELD_PRESETS[objectKey].tableColumns.map((key) => ({ key, header: headers[key] }));
}

function renderColumnContent(column: CrmTableColumnKey, row: CrmObjectRow, selected: boolean) {
  if (column === "primary") {
    return (
      <>
        <span className={`block max-w-[28ch] truncate font-semibold transition-colors group-hover:text-[var(--accent)] ${selected ? "text-[var(--accent)]" : "text-[var(--text-primary)]"}`}>
          {row.name}
        </span>
        <span className="mt-1 block text-xs text-[var(--text-secondary)]">{row.sourceLabel}</span>
      </>
    );
  }

  if (column === "secondary") {
    return (
      <>
        <span className="line-clamp-2 max-w-[30ch] text-[var(--text-secondary)]">{row.detail || "No detail captured"}</span>
        <span className="mt-1 block font-mono text-xs tabular-nums text-[var(--text-muted)]">{row.sourceLabel}</span>
      </>
    );
  }

  if (column === "persona") {
    return <Tag>{humanizeTag(row.personaTag)}</Tag>;
  }

  if (column === "score") {
    return (
      <span className="flex items-center gap-2">
        {typeof row.score === "number" ? <ScoreRing score={row.score} /> : <span className="rounded border border-[var(--border-hairline)] px-2 py-1 text-[11px] font-semibold leading-none text-[var(--text-muted)]">Unscored</span>}
        <MissingBadge missingFields={row.missingFields} />
      </span>
    );
  }

  if (column === "status") {
    return <StatusPill tone={statusTone(row.status)}>{row.status}</StatusPill>;
  }

  if (column === "updated") {
    return (
      <>
        <span className="block font-mono text-[13px] font-medium tabular-nums text-[var(--text-primary)]">{formatRelative(row.updated)}</span>
        <span className="mt-1 block font-mono text-xs tabular-nums text-[var(--text-muted)]">{formatCrmDate(row.updated)}</span>
      </>
    );
  }

  if (column === "nextAction") {
    return (
      <span className="flex items-start gap-2">
        <span className="mt-[3px] h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent)]" />
        <span className="line-clamp-2 max-w-[24ch] text-[13px] leading-5 text-[var(--text-secondary)]">{row.nextStep}</span>
      </span>
    );
  }

  if (column === "value") {
    return (
      <>
        <span className="block font-mono text-[13px] font-semibold tabular-nums text-[var(--text-primary)]">{row.valueLabel}</span>
        <span className="mt-1 block max-w-[24ch] truncate text-xs text-[var(--text-muted)]">{row.sourceLabel}</span>
      </>
    );
  }

  const [firstRelationship, secondRelationship] = row.relationships;
  return (
    <>
      <span className="block max-w-[24ch] truncate text-[13px] font-semibold text-[var(--text-primary)]">
        {firstRelationship ? `${firstRelationship.label}: ${firstRelationship.value}` : "No linked records"}
      </span>
      <span className="mt-1 block text-xs text-[var(--text-muted)]">
        {secondRelationship ? `+${Math.max(1, row.relationships.length - 1)} more` : `${row.relationships.length} linked`}
      </span>
    </>
  );
}

function SignalSelect({
  children,
  compact = false,
  label,
  onChange,
  value,
}: {
  children: React.ReactNode;
  compact?: boolean;
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  function handleChange(event: SelectChangeEvent<string>) {
    onChange(event.target.value);
  }

  return (
    <FormControl fullWidth size="small">
      <span className="sr-only">{label}</span>
      <Select
        aria-label={label}
        displayEmpty
        onChange={handleChange}
        size="small"
        sx={{
          "& .MuiOutlinedInput-notchedOutline": {
            borderColor: "var(--border-hairline)",
          },
          "& .MuiSelect-select": {
            alignItems: "center",
            display: "flex",
            minHeight: compact ? "30px" : "38px",
            paddingBottom: compact ? "0" : "0",
            paddingTop: compact ? "0" : "0",
          },
          "& .MuiSvgIcon-root": {
            color: "var(--text-muted)",
          },
          "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
            borderColor: "var(--accent)",
            borderWidth: "1px",
          },
          "&:hover .MuiOutlinedInput-notchedOutline": {
            borderColor: "var(--accent-border-strong)",
          },
          backgroundColor: "var(--surface-inset)",
          borderRadius: "8px",
          color: "var(--text-primary)",
          fontFamily: "inherit",
          fontSize: "0.875rem",
          fontWeight: 650,
          height: compact ? 32 : 40,
        }}
        value={value}
        MenuProps={{
          PaperProps: {
            sx: {
              "& .MuiMenuItem-root": {
                fontFamily: "inherit",
                fontSize: "0.875rem",
                fontWeight: 600,
              },
              "& .MuiMenuItem-root.Mui-selected": {
                backgroundColor: "var(--accent-soft)",
              },
              backgroundColor: "var(--surface-raised)",
              border: "1px solid var(--border-panel)",
              borderRadius: "8px",
              color: "var(--text-primary)",
            },
          },
        }}
      >
        {children}
      </Select>
    </FormControl>
  );
}

function ScoreRing({ score }: { score: number }) {
  const tone =
    score >= 75
      ? "text-[var(--ok)] border-[var(--ok-border)] bg-[var(--ok-soft)]"
      : score >= 55
        ? "text-[var(--warn)] border-[var(--warn-border)] bg-[var(--warn-soft)]"
        : "text-[var(--priority-bright)] border-[var(--priority-border)] bg-[var(--priority-soft)]";
  return (
    <span
      aria-label={`Score ${score}`}
      className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border font-mono text-[11px] font-semibold tabular-nums shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04)] ${tone}`}
    >
      {score}
    </span>
  );
}

function MissingBadge({ missingFields }: { missingFields: string[] }) {
  if (missingFields.length === 0) {
    return <span className="rounded border border-[var(--ok-border)] bg-transparent px-2 py-1 text-[11px] font-semibold leading-none text-[var(--ok)]">Clean</span>;
  }

  return (
    <span className="rounded border border-[var(--warn-border)] bg-transparent px-2 py-1 text-[11px] font-semibold leading-none text-[var(--warn-text)]" aria-label={missingFields.map(formatMissingField).join(", ")}>
      {missingFields.length} missing
    </span>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex max-w-[16ch] items-center rounded border border-[var(--border-hairline)] bg-[rgba(255,255,255,0.035)] px-2 py-1 text-[11px] font-semibold leading-none text-[var(--text-secondary)]">
      <span className="truncate">{children}</span>
    </span>
  );
}

function viewHref(objectHref: string, activeView: CrmListViewKey) {
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
