"use client";

import Link from "next/link";
import { type ColumnDef } from "@tanstack/react-table";
import { Search } from "lucide-react";
import { useMemo, useState } from "react";

import { DataTable } from "@/components/ui/data-table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState, StatusPill } from "../../_components/page-header";
import { theme } from "../../_components/theme";
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
  objectKey,
  objectLabel,
  primaryField,
  rows,
  secondaryField,
  views,
}: {
  activeView: CrmListViewKey;
  activeViewDescription: string;
  activeViewLabel: string;
  objectKey: CrmObjectKey;
  objectLabel: string;
  primaryField: string;
  rows: CrmObjectRow[];
  secondaryField: string;
  views: CrmListView[];
}) {
  const [query, setQuery] = useState("");
  const [dataFilter, setDataFilter] = useState<DataFilter>("all");
  const [personaFilter, setPersonaFilter] = useState("all");
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

  const columnDefs = useMemo<ColumnDef<CrmObjectRow>[]>(() => {
    return tableColumns.map((column) => ({
      id: column.key,
      header: column.header,
      cell: ({ row }) => renderColumnContent(column.key, row.original),
    }));
  }, [tableColumns]);

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

  return (
    <>
      <div className="border-b border-[var(--border-hairline)] bg-[var(--surface-inset)] px-4 py-3">
        <div className="grid gap-2 rounded-md border border-[var(--border-hairline)] bg-[var(--surface-panel)] p-2 xl:grid-cols-[minmax(240px,1fr)_150px_140px_130px]">
          <label className="relative block">
            <span className="sr-only">Search {objectLabel}</span>
            <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" strokeWidth={1.9} />
            <input
              aria-label={`Search ${objectLabel}`}
              className="h-10 w-full rounded-md border border-[var(--border-hairline)] bg-[var(--surface-inset)] py-2 pl-9 pr-3 text-sm font-medium text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
              onChange={(event) => {
                setQuery(event.target.value);
              }}
              placeholder={`Search ${objectLabel.toLowerCase()}...`}
              type="search"
              value={query}
            />
          </label>

          <SignalSelect
            label="Data quality"
            onChange={(value) => {
              setDataFilter(value as DataFilter);
            }}
            value={dataFilter}
          >
            <SelectItem value="all">Data: All</SelectItem>
            <SelectItem value="missing">Data: Missing</SelectItem>
            <SelectItem value="complete">Data: Complete</SelectItem>
          </SignalSelect>

          <FilterSelect
            label="Persona"
            onChange={(value) => {
              setPersonaFilter(value);
            }}
            options={personaOptions}
            value={personaFilter}
          />

          <SignalSelect
            label="Rows per page"
            compact
            onChange={(value) => setPageSize(Number(value))}
            value={String(pageSize)}
          >
            {PAGE_SIZES.map((size) => (
              <SelectItem key={size} value={String(size)}>
                {size} / page
              </SelectItem>
            ))}
          </SignalSelect>
        </div>

        <div className="mt-3 flex flex-col gap-2 text-sm text-[var(--text-secondary)] lg:flex-row lg:items-center lg:justify-between">
          <p>
            {activeViewDescription} Showing {filteredRows.length.toLocaleString("en-US")}
            {filteredRows.length === rows.length ? "" : ` matched from ${rows.length.toLocaleString("en-US")}`}.
          </p>
          <div className="flex flex-wrap gap-1.5 border-b border-[var(--border-hairline)] pb-3">
            {views.map((view) => (
              <Link
                aria-current={activeView === view.key ? "page" : undefined}
                className={`relative inline-flex min-h-8 items-center gap-2 rounded-[8px] px-2.5 text-xs font-semibold transition duration-150 ${
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
                {activeView === view.key ? <span aria-hidden className={theme.control.tabMarker} /> : null}
              </Link>
            ))}
          </div>
        </div>
      </div>

      <DataTable
        columns={columnDefs}
        data={filteredRows}
        getRowId={(row) => row.id}
        rowHref={(row) => row.href}
        pageSize={pageSize}
        paginationLabel="records"
        minWidth="min-w-[760px]"
        emptyState={
          <EmptyState
            title={activeView === "all-records" ? `No ${objectLabel.toLowerCase()} found` : `No ${activeViewLabel.toLowerCase()} records found`}
            detail={normalizedQuery ? `No records match "${query.trim()}". Clear the search or try another term.` : "No records match this CRM view yet."}
          />
        }
      />
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
      <SelectItem value="all">{label}: All</SelectItem>
      {options.map((option) => (
        <SelectItem key={option} value={option}>
          {option}
        </SelectItem>
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

function renderColumnContent(column: CrmTableColumnKey, row: CrmObjectRow) {
  if (column === "primary") {
    return (
      <>
        <span className="block max-w-[28ch] truncate font-semibold text-[var(--text-primary)] transition-colors group-hover:text-[var(--accent)]">
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
  // Radix Select (already app-themed) — replaces @mui/material so the CRM route
  // no longer pulls MUI + the @emotion CSS-in-JS runtime into its client bundle.
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger aria-label={label} size={compact ? "sm" : "default"} className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>{children}</SelectContent>
    </Select>
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
