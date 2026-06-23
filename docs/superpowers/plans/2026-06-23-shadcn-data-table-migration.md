# shadcn Data Table — App-Wide Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the app's hand-rolled `DataTable` and bespoke raw tables with the canonical shadcn Data Table pattern — a Signal-themed shadcn `Table` primitive plus a reusable `@tanstack/react-table`-backed `DataTable` — with no visual regression.

**Architecture:** Two layers. `src/components/ui/table.tsx` is the shadcn `Table` primitive re-skinned to the Command Charcoal palette (Signal CSS tokens). `src/components/ui/data-table.tsx` is a client wrapper that runs the TanStack engine (opt-in sorting, opt-in pagination, row links / row click+dblclick, selection, accent rail) and renders through the primitive. The old `src/app/_components/data-table.tsx` is created-new-then-deleted at the end so every intermediate task compiles.

**Tech Stack:** Next.js 16 (RSC), React 19, TypeScript, Tailwind v4 (CSS variables), `@tanstack/react-table` v8, shadcn (new-york), lucide-react.

**Spec:** `docs/superpowers/specs/2026-06-23-shadcn-data-table-migration-design.md`

---

## Conventions used throughout this plan

**Column transformation rule** (old `Column<T>` → TanStack `ColumnDef<T>`):
- `{ key: "x", header: "H", cell: (row) => <X row/> }` becomes
  `{ id: "x", header: "H", cell: ({ row }) => <X r={row.original}/> }` — i.e. the
  cell receives `{ row }` and you read the record via `row.original`.
- Old per-column `align` / `width` / `cellClassName` / `headClassName` move into
  `meta: { align, width, cellClassName, headClassName }` (typed via the
  `ColumnMeta` augmentation in Task 2).
- `rows` prop → `data`; `rowKey={(r)=>r.id}` → `getRowId={(r)=>r.id}`.

**Verification reality:** the repo has **no jsdom / React Testing Library** harness
(only vitest for pure domain logic). Do **not** add unrunnable component tests.
UI is verified by: `pnpm build` (typecheck), scoped ESLint, `pnpm test` (domain
tests stay green), and preview DOM/computed-style checks. Screenshots can hang on
particle-canvas pages — prefer `preview_eval`.

**Scoped lint command** (full `pnpm lint` scans vendored files — see project memory):
`pnpm exec eslint <changed files>`.

---

## Task 1: Dependency + shadcn `Table` primitive

**Files:**
- Modify: `package.json` (add dependency via pnpm)
- Create: `src/components/ui/table.tsx`

- [ ] **Step 1: Add the TanStack dependency**

Run: `pnpm add @tanstack/react-table`
Expected: `package.json` gains `"@tanstack/react-table": "^8.x"`; `pnpm-lock.yaml` updates.

- [ ] **Step 2: Create the Signal-themed primitive**

Create `src/components/ui/table.tsx`:

```tsx
import * as React from "react"

import { cn } from "@/lib/utils"

function Table({ className, ...props }: React.ComponentProps<"table">) {
  return (
    <div className="relative w-full overflow-x-auto">
      <table
        data-slot="table"
        className={cn(
          "w-full caption-bottom border-separate border-spacing-0 text-left text-sm",
          className,
        )}
        {...props}
      />
    </div>
  )
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return <thead data-slot="table-header" className={cn(className)} {...props} />
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return <tbody data-slot="table-body" className={cn(className)} {...props} />
}

function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn("bg-[var(--surface-inset)] font-medium", className)}
      {...props}
    />
  )
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        "transition-colors duration-150 hover:bg-[var(--surface-raised)] data-[state=selected]:bg-[var(--accent-soft)]",
        className,
      )}
      {...props}
    />
  )
}

function TableHead({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      data-slot="table-head"
      scope="col"
      className={cn(
        "whitespace-nowrap px-3 py-3 text-left align-middle text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]",
        className,
      )}
      {...props}
    />
  )
}

function TableCell({ className, ...props }: React.ComponentProps<"td">) {
  return (
    <td
      data-slot="table-cell"
      className={cn("border-t border-[var(--border-hairline)] px-3 py-4 align-top", className)}
      {...props}
    />
  )
}

function TableCaption({ className, ...props }: React.ComponentProps<"caption">) {
  return (
    <caption data-slot="table-caption" className={cn("mt-4 text-sm text-[var(--text-muted)]", className)} {...props} />
  )
}

export { Table, TableHeader, TableBody, TableFooter, TableHead, TableRow, TableCell, TableCaption }
```

- [ ] **Step 3: Typecheck + lint**

Run: `pnpm build`
Expected: build succeeds (the primitive is unused so far; no type errors).
Run: `pnpm exec eslint src/components/ui/table.tsx`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add package.json pnpm-lock.yaml src/components/ui/table.tsx
git commit -m "feat(ui): add @tanstack/react-table + Signal-themed shadcn Table primitive"
```

---

## Task 2: The shared TanStack `DataTable` wrapper

**Files:**
- Create: `src/components/ui/data-table.tsx`

This is created at a NEW path so nothing breaks; existing consumers keep using the
old `src/app/_components/data-table.tsx` until migrated. The old file is deleted in
Task 12.

- [ ] **Step 1: Create the wrapper**

Create `src/components/ui/data-table.tsx`:

```tsx
"use client";

import * as React from "react";
import Link from "next/link";
import {
  type ColumnDef,
  type RowData,
  type SortingState,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { ChevronDown, ChevronsUpDown, ChevronUp } from "lucide-react";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PaginationControls } from "@/app/_components/pagination-controls";
import { cn } from "@/lib/utils";

// Per-column display hints carried through ColumnDef.meta so cell renderers stay clean.
declare module "@tanstack/react-table" {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData extends RowData, TValue> {
    align?: "left" | "right";
    width?: string;
    headClassName?: string;
    cellClassName?: string;
  }
}

export type DataTableProps<TData> = {
  columns: ColumnDef<TData, unknown>[];
  data: TData[];
  getRowId: (row: TData) => string;
  /** When set, the whole row links here and cells become <Link>-wrapped (as before). */
  rowHref?: (row: TData) => string | null | undefined;
  /** Row-level handlers for non-link tables (e.g. CRM single-click select / double-click open). */
  onRowClick?: (row: TData) => void;
  onRowDoubleClick?: (row: TData) => void;
  isSelected?: (row: TData) => boolean;
  /** Opt-in client sorting via clickable headers. Off by default for parity. */
  enableSorting?: boolean;
  /** When a number, DataTable owns pagination and renders the footer. */
  pageSize?: number;
  paginationLabel?: string;
  /** Draw the left accent rail on the selected row's first cell (CRM master/detail). */
  pinnedAccentRail?: boolean;
  emptyState?: React.ReactNode;
  minWidth?: string;
};

export function DataTable<TData>({
  columns,
  data,
  getRowId,
  rowHref,
  onRowClick,
  onRowDoubleClick,
  isSelected,
  enableSorting = false,
  pageSize,
  paginationLabel = "rows",
  pinnedAccentRail = false,
  emptyState,
  minWidth = "min-w-[880px]",
}: DataTableProps<TData>) {
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const paginated = typeof pageSize === "number";

  const table = useReactTable({
    data,
    columns,
    getRowId: (row) => getRowId(row),
    getCoreRowModel: getCoreRowModel(),
    enableSorting,
    ...(enableSorting
      ? { getSortedRowModel: getSortedRowModel(), onSortingChange: setSorting, state: { sorting } }
      : {}),
    ...(paginated
      ? { getPaginationRowModel: getPaginationRowModel(), initialState: { pagination: { pageSize } } }
      : {}),
  });

  // Keep the requested page size in sync when the consumer changes it.
  React.useEffect(() => {
    if (paginated) table.setPageSize(pageSize as number);
  }, [paginated, pageSize, table]);

  const rows = table.getRowModel().rows;
  const headers = table.getHeaderGroups()[0]?.headers ?? [];
  const pageState = table.getState().pagination;
  const pageCount = Math.max(1, table.getPageCount());

  return (
    <>
      <div className="overflow-x-auto">
        <Table className={minWidth}>
          <TableHeader>
            <TableRow className="bg-[var(--surface-inset)] hover:bg-[var(--surface-inset)]">
              {headers.map((header) => {
                const meta = header.column.columnDef.meta;
                const sortable = enableSorting && header.column.getCanSort();
                return (
                  <TableHead
                    key={header.id}
                    className={cn(meta?.align === "right" && "text-right", meta?.width, meta?.headClassName)}
                  >
                    {header.isPlaceholder ? null : sortable ? (
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 text-inherit"
                        onClick={header.column.getToggleSortingHandler()}
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        <SortIcon dir={header.column.getIsSorted()} />
                      </button>
                    ) : (
                      flexRender(header.column.columnDef.header, header.getContext())
                    )}
                  </TableHead>
                );
              })}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => {
              const original = row.original;
              const href = rowHref?.(original) ?? null;
              const selected = isSelected?.(original) ?? false;
              const clickable = Boolean(onRowClick || onRowDoubleClick);
              return (
                <TableRow
                  key={row.id}
                  data-state={selected ? "selected" : undefined}
                  aria-current={selected ? "page" : undefined}
                  tabIndex={clickable ? 0 : undefined}
                  onClick={clickable ? () => onRowClick?.(original) : undefined}
                  onDoubleClick={clickable ? () => onRowDoubleClick?.(original) : undefined}
                  onKeyDown={
                    clickable
                      ? (event) => {
                          if (event.key === "Enter") onRowDoubleClick?.(original);
                          else if (event.key === " ") {
                            event.preventDefault();
                            onRowClick?.(original);
                          }
                        }
                      : undefined
                  }
                  className={cn("group", (href || clickable) && "cursor-pointer")}
                >
                  {row.getVisibleCells().map((cell, index) => {
                    const meta = cell.column.columnDef.meta;
                    const railed = pinnedAccentRail && index === 0 && selected;
                    return (
                      <TableCell
                        key={cell.id}
                        className={cn(
                          href && "p-0",
                          meta?.align === "right" && "text-right",
                          meta?.width,
                          railed && "relative",
                          meta?.cellClassName,
                        )}
                      >
                        {railed ? (
                          <span aria-hidden className="absolute left-0 top-0 h-full w-px bg-[var(--accent)]" />
                        ) : null}
                        {href ? (
                          <Link
                            href={href}
                            className={cn(
                              "block h-full px-3 py-4 text-inherit no-underline outline-none transition focus-visible:bg-[var(--accent-soft)]",
                              meta?.align === "right" ? "text-right" : "text-left",
                            )}
                          >
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </Link>
                        ) : (
                          flexRender(cell.column.columnDef.cell, cell.getContext())
                        )}
                      </TableCell>
                    );
                  })}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        {rows.length === 0 && emptyState ? (
          <div className="border-t border-[var(--border-hairline)] px-5 py-8">{emptyState}</div>
        ) : null}
      </div>
      {paginated ? (
        <PaginationControls
          currentPage={pageState.pageIndex + 1}
          pageCount={pageCount}
          startIndex={pageState.pageIndex * pageState.pageSize}
          endIndex={Math.min((pageState.pageIndex + 1) * pageState.pageSize, data.length)}
          total={data.length}
          itemLabel={paginationLabel}
          onPageChange={(page) => table.setPageIndex(page - 1)}
        />
      ) : null}
    </>
  );
}

function SortIcon({ dir }: { dir: false | "asc" | "desc" }) {
  if (dir === "asc") return <ChevronUp aria-hidden className="h-3.5 w-3.5" strokeWidth={1.8} />;
  if (dir === "desc") return <ChevronDown aria-hidden className="h-3.5 w-3.5" strokeWidth={1.8} />;
  return <ChevronsUpDown aria-hidden className="h-3.5 w-3.5 text-[var(--text-muted)]" strokeWidth={1.8} />;
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `pnpm build`
Expected: build succeeds (wrapper is exported but unused).
Run: `pnpm exec eslint src/components/ui/data-table.tsx`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/data-table.tsx
git commit -m "feat(ui): add TanStack-backed DataTable wrapper"
```

---

## Task 3: Migrate Brain browser

**Files:**
- Modify: `src/app/brain/_components/brain-browser.tsx`

`brain-browser.tsx` is already `"use client"`. Replace the `Column<BrainNode>[]`
array and the `<DataTable>` call.

- [ ] **Step 1: Swap the import**

Change line 5 from:
```tsx
import { DataTable, type Column } from "@/app/_components/data-table";
```
to:
```tsx
import { type ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/ui/data-table";
```

- [ ] **Step 2: Replace the columns array**

Replace the `const columns: Array<Column<BrainNode>> = [ ... ];` block with:

```tsx
const columns: ColumnDef<BrainNode>[] = [
  {
    id: "fact",
    header: "Fact",
    cell: ({ row }) => {
      const n = row.original;
      return (
        <div className="min-w-0">
          <p className="truncate font-semibold text-[var(--text-primary)]">{n.label}</p>
          {n.body ? <p className="truncate text-sm leading-6 text-[var(--text-secondary)]">{n.body}</p> : null}
        </div>
      );
    },
  },
  {
    id: "kind",
    header: "Kind",
    cell: ({ row }) => (
      <span className="text-xs uppercase tracking-[0.08em] text-[var(--text-muted)]">{row.original.kind.replace(/_/g, " ")}</span>
    ),
  },
  {
    id: "source",
    header: "Source",
    cell: ({ row }) => {
      const prov = nodeProvenance(row.original);
      return (
        <span className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: SOURCE_DOT[prov.system] }} />
          {prov.label}
        </span>
      );
    },
  },
  {
    id: "trust",
    header: "Trust",
    cell: ({ row }) => <StatusPill tone={TIER_TONE[row.original.trustTier] ?? "blue"}>{row.original.trustTier}</StatusPill>,
  },
  {
    id: "link",
    header: "",
    meta: { align: "right" },
    cell: ({ row }) => {
      const prov = nodeProvenance(row.original);
      return prov.deepLink ? (
        <Link href={prov.deepLink.href} className="text-xs text-[var(--text-secondary)] underline-offset-2 hover:text-[var(--accent)] hover:underline">
          {prov.deepLink.label} ↗
        </Link>
      ) : null;
    },
  },
];
```

- [ ] **Step 3: Update the call site**

Replace `<DataTable columns={columns} rows={nodes} rowKey={(n) => n.id} minWidth="min-w-[760px]" />` with:
```tsx
<DataTable columns={columns} data={nodes} getRowId={(n) => n.id} minWidth="min-w-[760px]" />
```

- [ ] **Step 4: Verify**

Run: `pnpm build` → succeeds.
Run: `pnpm exec eslint src/app/brain/_components/brain-browser.tsx` → no errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/brain/_components/brain-browser.tsx
git commit -m "refactor(brain): move Brain table to shared shadcn DataTable"
```

---

## Task 4: Migrate Analytics campaign-performance-table

**Files:**
- Modify: `src/app/analytics/_components/overview/campaign-performance-table.tsx`

This file is currently a server component but defines `cell` render functions, so it
must become a client component when it renders the client `DataTable`. It receives
only serializable `rows` from its server parent, so `"use client"` is safe.

- [ ] **Step 1: Add the client directive and swap imports**

Add `"use client";` as the first line. Change line 2 from:
```tsx
import { DataTable, type Column } from "@/app/_components/data-table";
```
to:
```tsx
import { type ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/ui/data-table";
```

- [ ] **Step 2: Replace the COLUMNS array**

Replace `const COLUMNS: Column<CampaignPerformanceRow>[] = [ ... ];` with:

```tsx
const COLUMNS: ColumnDef<CampaignPerformanceRow>[] = [
  {
    id: "campaign",
    header: "Campaign",
    cell: ({ row }) => (
      <div className="min-w-0">
        <div className="truncate font-semibold text-[var(--text-primary)]">{row.original.name}</div>
        <div className="mt-0.5 text-xs text-[var(--text-secondary)]">{row.original.persona}</div>
      </div>
    ),
  },
  { id: "impressions", header: "Impressions", meta: { align: "right", width: "w-[120px]" }, cell: ({ row }) => <Num value={row.original.impressions} /> },
  { id: "clicks", header: "Clicks", meta: { align: "right", width: "w-[90px]" }, cell: ({ row }) => <Num value={row.original.clicks} /> },
  { id: "leads", header: "Leads", meta: { align: "right", width: "w-[80px]" }, cell: ({ row }) => <Num value={row.original.leads} /> },
  { id: "booked", header: "Booked", meta: { align: "right", width: "w-[80px]" }, cell: ({ row }) => <Num value={row.original.booked} accent /> },
  {
    id: "revenue",
    header: "Revenue",
    meta: { align: "right", width: "w-[120px]" },
    cell: ({ row }) => (
      <span className="font-mono text-sm font-semibold tabular-nums text-[var(--text-primary)]">{USD.format(row.original.revenueCents / 100)}</span>
    ),
  },
  {
    id: "conversion",
    header: "Conv.",
    meta: { align: "right", width: "w-[96px]" },
    cell: ({ row }) => {
      const t = TREND[row.original.trend];
      return (
        <span className="inline-flex items-center justify-end gap-1.5">
          <span className="font-mono text-sm font-semibold tabular-nums text-[var(--text-primary)]">{row.original.conversion}%</span>
          <span className={`text-[11px] ${t.className}`} aria-hidden="true">{t.glyph}</span>
        </span>
      );
    },
  },
];
```

- [ ] **Step 3: Update the call site**

Replace the `<DataTable .../>` JSX with:
```tsx
<DataTable
  columns={COLUMNS}
  data={rows}
  getRowId={(row) => row.id}
  rowHref={(row) => `/analytics/${row.id}`}
  minWidth="min-w-[820px]"
  emptyState={<EmptyState title="No campaign performance yet" detail="Once campaigns report results, each one's impressions, leads, and revenue appear here." />}
/>
```

- [ ] **Step 4: Verify**

Run: `pnpm build` → succeeds.
Run: `pnpm exec eslint src/app/analytics/_components/overview/campaign-performance-table.tsx` → no errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/analytics/_components/overview/campaign-performance-table.tsx
git commit -m "refactor(analytics): move campaign performance table to shared DataTable"
```

---

## Task 5: Migrate Analytics explorer table

**Files:**
- Modify: `src/app/analytics/_components/overview/analytics-explorer.tsx`

Already `"use client"`. It defines its own `CAMPAIGN_COLUMNS` (mirrors Task 4).

- [ ] **Step 1: Swap imports**

Change line 8 from:
```tsx
import { DataTable, type Column } from "@/app/_components/data-table";
```
to:
```tsx
import { type ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/ui/data-table";
```

- [ ] **Step 2: Replace the CAMPAIGN_COLUMNS array**

Replace `const CAMPAIGN_COLUMNS: Column<CampaignPerformanceRow>[] = [ ... ];` with the
exact same array shown in Task 4 Step 2 (identical column set; `CampaignPerformanceRow`).

- [ ] **Step 3: Update the call site**

Replace the `<DataTable .../>` JSX with:
```tsx
<DataTable
  columns={CAMPAIGN_COLUMNS}
  data={filteredRows}
  getRowId={(row) => row.id}
  rowHref={(row) => `/analytics/${row.id}`}
  minWidth="min-w-[820px]"
  emptyState={<EmptyState title="No campaigns match" detail="No campaigns match the current filters. Clear a filter to see more." />}
/>
```

- [ ] **Step 4: Verify**

Run: `pnpm build` → succeeds.
Run: `pnpm exec eslint src/app/analytics/_components/overview/analytics-explorer.tsx` → no errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/analytics/_components/overview/analytics-explorer.tsx
git commit -m "refactor(analytics): move explorer campaign table to shared DataTable"
```

---

## Task 6: Migrate Analytics page fallback table (extract client component)

**Files:**
- Create: `src/app/analytics/_components/overview/campaign-comparison-table.tsx`
- Modify: `src/app/analytics/page.tsx`

`analytics/page.tsx` is a server component; its `CAMPAIGN_COLUMNS` contains `cell`
functions that cannot cross the server→client boundary. Extract a client component
that owns the columns and renders `DataTable`, receiving only serializable rows.

- [ ] **Step 1: Create the client table component**

Create `src/app/analytics/_components/overview/campaign-comparison-table.tsx`:

```tsx
"use client";

import { type ColumnDef } from "@tanstack/react-table";

import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/app/_components/page-header";
import { SegmentedBar } from "../charts/segmented-bar";

export type ComparisonRowData = {
  id: string;
  name: string;
  persona: string;
  updatedAt: string;
  assetCount: number;
  approved: number;
  total: number;
  pending: number;
  changes: number;
  readiness: number;
  state: "ready" | "changes" | "waiting" | "draft";
};

const COLUMNS: ColumnDef<ComparisonRowData>[] = [
  {
    id: "campaign",
    header: "Campaign",
    cell: ({ row }) => {
      const r = row.original;
      return (
        <div className="min-w-0">
          <div className="truncate font-semibold text-[var(--text-primary)]">{r.name}</div>
          <div className="mt-0.5 text-xs text-[var(--text-secondary)]">
            {r.persona} &middot; {r.assetCount} {r.assetCount === 1 ? "asset" : "assets"} &middot; updated {r.updatedAt}
          </div>
        </div>
      );
    },
  },
  {
    id: "status",
    header: "Status",
    meta: { width: "w-[180px]" },
    cell: ({ row }) => <StateBadge row={row.original} />,
  },
  {
    id: "progress",
    header: "Progress",
    meta: { width: "w-[220px]" },
    cell: ({ row }) => {
      const r = row.original;
      return (
        <div className="min-w-0">
          <SegmentedBar
            segments={[
              { key: "approved", value: r.approved, toneVar: "ok" },
              { key: "pending", value: r.pending, toneVar: "warn" },
              { key: "changes", value: r.changes, toneVar: "priority" },
              { key: "draft", value: Math.max(r.total - r.approved - r.pending - r.changes, 0), toneVar: "idle" },
            ]}
          />
          <div className="mt-1.5 text-xs font-medium text-[var(--text-muted)]">
            {r.total > 0 ? `${r.approved} of ${r.total} approved` : "No pieces yet"}
          </div>
        </div>
      );
    },
  },
  {
    id: "readiness",
    header: "Approved",
    meta: { align: "right", width: "w-[96px]" },
    cell: ({ row }) => (
      <span className="font-display text-lg font-bold tabular-nums tracking-[-0.03em] text-[var(--text-primary)]">{row.original.readiness}%</span>
    ),
  },
];

function StateBadge({ row }: { row: ComparisonRowData }) {
  const config =
    row.state === "changes"
      ? {
          label: `${row.changes} need ${row.changes === 1 ? "a change" : "changes"}`,
          className: "border-[oklch(0.68_0.2_26/0.4)] bg-[oklch(0.68_0.2_26/0.13)] text-[oklch(0.86_0.09_26)]",
        }
      : row.state === "waiting"
        ? {
            label: `${row.pending} waiting for approval`,
            className: "border-[oklch(0.82_0.13_85/0.36)] bg-[oklch(0.82_0.13_85/0.12)] text-[oklch(0.9_0.09_85)]",
          }
        : row.state === "ready"
          ? {
              label: "Ready",
              className: "border-[oklch(0.78_0.14_158/0.36)] bg-[oklch(0.78_0.14_158/0.12)] text-[oklch(0.88_0.1_158)]",
            }
          : {
              label: "In draft",
              className: "border-[var(--border-hairline)] bg-[var(--surface-soft)] text-[var(--text-muted)]",
            };

  return (
    <span className={`inline-block shrink-0 rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] ${config.className}`}>
      {config.label}
    </span>
  );
}

export function CampaignComparisonTable({ rows }: { rows: ComparisonRowData[] }) {
  return (
    <DataTable
      columns={COLUMNS}
      data={rows}
      getRowId={(row) => row.id}
      rowHref={(row) => `/analytics/${row.id}`}
      minWidth="min-w-[760px]"
      emptyState={<EmptyState title="No campaigns yet" detail="When Arc drafts a campaign or you create one, it will appear here with its progress." />}
    />
  );
}
```

- [ ] **Step 2: Rewire `analytics/page.tsx`**

In `src/app/analytics/page.tsx`:
- Remove the import `import { DataTable, type Column } from "../_components/data-table";` (line 6).
- Remove the `SegmentedBar` import if it is now unused on the page (it is used only by the moved columns — confirm with a search; if still used elsewhere on the page, keep it).
- Add: `import { CampaignComparisonTable, type ComparisonRowData } from "./_components/overview/campaign-comparison-table";`
- Delete the local `type ComparisonRowData = { ... }` declaration (now imported) — but keep `toComparisonRow` and `byMostNeedingAttention`, changing their annotations to use the imported `ComparisonRowData`.
- Delete the local `const CAMPAIGN_COLUMNS = [ ... ]` and the local `function StateBadge(...)` (moved to the new file).
- In the fallback branch, replace:
```tsx
<DataTable
  columns={CAMPAIGN_COLUMNS}
  rows={rows}
  rowKey={(row) => row.id}
  rowHref={(row) => `/analytics/${row.id}`}
  minWidth="min-w-[760px]"
  emptyState={<EmptyState title="No campaigns yet" detail="When Arc drafts a campaign or you create one, it will appear here with its progress." />}
/>
```
with:
```tsx
<CampaignComparisonTable rows={rows} />
```

- [ ] **Step 3: Verify**

Run: `pnpm build` → succeeds (confirms no leftover references to the removed symbols).
Run: `pnpm exec eslint src/app/analytics/page.tsx src/app/analytics/_components/overview/campaign-comparison-table.tsx` → no errors (fix any "unused import" for `SegmentedBar`/`Column` flagged here).

- [ ] **Step 4: Commit**

```bash
git add src/app/analytics/page.tsx src/app/analytics/_components/overview/campaign-comparison-table.tsx
git commit -m "refactor(analytics): extract client comparison table on shared DataTable"
```

---

## Task 7: Migrate Agent detail page table (extract client component)

**Files:**
- Create: `src/app/agent-operations/[agentKey]/_components/agent-task-table.tsx`
- Modify: `src/app/agent-operations/[agentKey]/page.tsx`

Same RSC reason as Task 6: the page is a server component with inline `cell`
functions. Extract a client table that receives serializable `tasks`.

- [ ] **Step 1: Create the client table component**

Create `src/app/agent-operations/[agentKey]/_components/agent-task-table.tsx`:

```tsx
"use client";

import { type ColumnDef } from "@tanstack/react-table";

import { DataTable } from "@/components/ui/data-table";
import { EmptyState, StatusPill } from "@/app/_components/page-header";
import { type AgentOperationsTask } from "@/lib/agent-operations/read-model";

const COLUMNS: ColumnDef<AgentOperationsTask>[] = [
  {
    id: "objective",
    header: "Objective",
    cell: ({ row }) => (
      <>
        <div className="font-bold text-[var(--text-primary)] transition group-hover:text-[var(--accent)]">{row.original.task}</div>
        <div className="mt-1 line-clamp-2 text-xs text-[var(--text-muted)]">{row.original.objective}</div>
      </>
    ),
  },
  { id: "status", header: "Status", cell: ({ row }) => <StatusPill tone={statusTone(row.original.status)}>{row.original.status}</StatusPill> },
  { id: "risk", header: "Risk", cell: ({ row }) => <StatusPill tone={riskTone(row.original.risk)}>{row.original.risk}</StatusPill> },
  {
    id: "linked",
    header: "Linked work",
    cell: ({ row }) => <span className="text-sm font-semibold text-[var(--accent)]">{row.original.linkedObject}</span>,
  },
  { id: "updated", header: "Updated", meta: { cellClassName: "text-[var(--text-secondary)]" }, cell: ({ row }) => row.original.updated },
];

export function AgentTaskTable({ tasks }: { tasks: AgentOperationsTask[] }) {
  return (
    <DataTable
      columns={COLUMNS}
      data={tasks}
      getRowId={(row) => row.fullId}
      rowHref={(row) => row.href}
      minWidth="min-w-[920px]"
      emptyState={<EmptyState title="No tasks for this agent" detail="When tasks are assigned here, they will appear with linked records, risk, and approval state." />}
    />
  );
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
```

- [ ] **Step 2: Rewire `[agentKey]/page.tsx`**

In `src/app/agent-operations/[agentKey]/page.tsx`:
- Remove `import { DataTable } from "@/app/_components/data-table";` (line 5).
- Add `import { AgentTaskTable } from "./_components/agent-task-table";`
- Replace the entire `<DataTable ...>...</DataTable>` block (lines 63-89) with:
```tsx
<AgentTaskTable tasks={tasks} />
```
- Leave the page's own `statusTone` / `riskTone` helpers in place — they are still
  used by the `agent.status` `StatusPill` near the top of the page.

- [ ] **Step 3: Verify**

Run: `pnpm build` → succeeds.
Run: `pnpm exec eslint "src/app/agent-operations/[agentKey]/page.tsx" "src/app/agent-operations/[agentKey]/_components/agent-task-table.tsx"` → no errors.

- [ ] **Step 4: Commit**

```bash
git add "src/app/agent-operations/[agentKey]/page.tsx" "src/app/agent-operations/[agentKey]/_components/agent-task-table.tsx"
git commit -m "refactor(agent-ops): extract client agent task table on shared DataTable"
```

---

## Task 8: Migrate Agent task board (pagination into DataTable)

**Files:**
- Modify: `src/app/agent-operations/agent-task-board.tsx`

Already `"use client"`. Keep the search box and the filter-tab strip; move pagination
into `DataTable` (delete the manual page math + the external `PaginationControls`).

- [ ] **Step 1: Swap imports**

Change lines 7-9:
```tsx
import { DataTable } from "../_components/data-table";
import { EmptyState, StatusPill } from "../_components/page-header";
import { PaginationControls } from "../_components/pagination-controls";
```
to:
```tsx
import { type ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState, StatusPill } from "../_components/page-header";
```
(Remove the `PaginationControls` import — it is no longer used here.)

- [ ] **Step 2: Remove the manual pagination state + slicing**

Delete these lines from the component body:
```tsx
const [page, setPage] = useState(1);
...
const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
const currentPage = Math.min(page, pageCount);
const startIndex = filtered.length === 0 ? 0 : (currentPage - 1) * pageSize;
const endIndex = Math.min(startIndex + pageSize, filtered.length);
const visibleTasks = filtered.slice(startIndex, endIndex);

function resetPage() {
  setPage(1);
}
```
Keep `const [pageSize, setPageSize] = useState(8);` (still drives the page-size
select). Remove every remaining `resetPage();` call in the search and filter
handlers (DataTable auto-resets to page 1 when `data` changes).

- [ ] **Step 3: Fix the page-size select handler**

The page-size `<select>` `onChange` becomes just:
```tsx
onChange={(event) => setPageSize(Number(event.target.value))}
```

- [ ] **Step 4: Simplify the summary line**

Replace the "Showing …" paragraph (lines ~82-85) with:
```tsx
<p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
  Showing {filtered.length} of {tasks.length} task records
  {filtered.length === tasks.length ? "" : " (filtered)"}.
</p>
```

- [ ] **Step 5: Define columns + render DataTable with pagination**

Replace the entire `<DataTable rows={visibleTasks} ... />` block AND the trailing
`<PaginationControls ... />` block with this single block. Define `COLUMNS` as a
module-level const above the component (after the `FILTERS` const):

```tsx
const COLUMNS: ColumnDef<AgentOperationsTask>[] = [
  {
    id: "task",
    header: "Objective",
    cell: ({ row }) => (
      <>
        <div className="font-bold text-[var(--text-primary)] transition group-hover:text-[var(--accent)]">{row.original.task}</div>
        <div className="mt-1 line-clamp-2 text-xs text-[var(--text-muted)]">{row.original.objective}</div>
      </>
    ),
  },
  { id: "agent", header: "Agent", meta: { cellClassName: "text-[var(--text-secondary)]" }, cell: ({ row }) => row.original.agentName },
  { id: "status", header: "Status", cell: ({ row }) => <StatusPill tone={statusTone(row.original.status)}>{row.original.status}</StatusPill> },
  { id: "risk", header: "Risk", cell: ({ row }) => <StatusPill tone={riskTone(row.original.risk)}>{row.original.risk}</StatusPill> },
  {
    id: "linked",
    header: "Linked record",
    cell: ({ row }) => <span className="text-sm font-semibold text-[var(--accent)]">{row.original.linkedObject}</span>,
  },
  { id: "updated", header: "Updated", meta: { cellClassName: "text-[var(--text-secondary)]" }, cell: ({ row }) => row.original.updated },
];
```

And the render (note `agentName` is in scope inside the component, so the
`emptyState` stays inline here):

```tsx
<DataTable
  columns={COLUMNS}
  data={filtered}
  getRowId={(row) => row.fullId}
  rowHref={(row) => row.href}
  minWidth="min-w-[1020px]"
  pageSize={pageSize}
  paginationLabel="tasks"
  emptyState={<EmptyState title={`No matching ${agentName} tasks`} detail="Clear the search or choose a different task status filter." />}
/>
```

- [ ] **Step 6: Verify**

Run: `pnpm build` → succeeds.
Run: `pnpm exec eslint src/app/agent-operations/agent-task-board.tsx` → no errors
(fix any unused-var warnings for removed pagination symbols).

- [ ] **Step 7: Commit**

```bash
git add src/app/agent-operations/agent-task-board.tsx
git commit -m "refactor(agent-ops): task board on shared DataTable with built-in pagination"
```

---

## Task 9: Migrate Approvals history table (pagination into DataTable)

**Files:**
- Modify: `src/app/approvals/approval-history-table.tsx`

Already `"use client"`. Keep the search box + decision-filter tabs; convert the raw
`<table>` to `DataTable` with row links and built-in pagination. The per-row link
target is computed from the row, so use `rowHref`.

- [ ] **Step 1: Swap imports**

Change lines 6-9:
```tsx
import { EmptyState, StatusPill } from "@/app/_components/page-header";
import { PaginationControls } from "@/app/_components/pagination-controls";
import { theme } from "@/app/_components/theme";
import { type ApprovalHistoryEntry } from "@/lib/approvals/read-model";
```
to:
```tsx
import { type ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState, StatusPill } from "@/app/_components/page-header";
import { theme } from "@/app/_components/theme";
import { type ApprovalHistoryEntry } from "@/lib/approvals/read-model";
```
(Drop `PaginationControls`; drop the now-unused `Link` import on line 3 — confirm it
is unused after this task and remove it.)

- [ ] **Step 2: Remove manual pagination math**

Delete:
```tsx
const [page, setPage] = useState(1);
...
const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
const currentPage = Math.min(page, pageCount);
const startIndex = filtered.length === 0 ? 0 : (currentPage - 1) * pageSize;
const endIndex = Math.min(startIndex + pageSize, filtered.length);
const visibleRows = filtered.slice(startIndex, endIndex);

function resetPage() {
  setPage(1);
}
```
Keep `const [pageSize, setPageSize] = useState(10);`. Remove every `resetPage();`
call in the search and filter handlers. The page-size `<select>` `onChange` becomes
`onChange={(event) => setPageSize(Number(event.target.value))}`.

- [ ] **Step 3: Simplify the summary line**

Replace the "Showing …" paragraph (lines ~80-83) with:
```tsx
<p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
  Showing {filtered.length} of {decisions.length}
  {filtered.length === decisions.length ? "" : " matched"} decisions.
</p>
```

- [ ] **Step 4: Add the columns + DataTable, removing the raw table + HistoryCell**

Add a module-level `COLUMNS` const (above the component). Each cell carries the
classNames the old `HistoryCell` applied, via `meta.cellClassName`. The whole row
links via `rowHref`, so the cell padding comes from the wrapper's `<Link>` wrapper;
keep the `p-0` behavior automatic (the wrapper sets it when `rowHref` is present).

```tsx
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
```

Then replace the whole `<div className="overflow-x-auto"><table>…</table></div>`
block, the standalone empty-state `<div>` below it, and the `<PaginationControls .../>`
block with:

```tsx
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
```

Delete the now-unused `HistoryCell` helper function at the bottom of the file. Keep
`decisionBucket`, `decisionTone`, and `formatWhen`.

- [ ] **Step 5: Verify**

Run: `pnpm build` → succeeds.
Run: `pnpm exec eslint src/app/approvals/approval-history-table.tsx` → no errors.

- [ ] **Step 6: Commit**

```bash
git add src/app/approvals/approval-history-table.tsx
git commit -m "refactor(approvals): history table on shared DataTable with built-in pagination"
```

---

## Task 10: Migrate Campaign detail asset table

**Files:**
- Modify: `src/app/analytics/_components/campaign-detail-explorer.tsx`

Already `"use client"`. Only the `AssetTable` sub-component (raw `<table>`) is in
scope; the funnel, channel bars, donut, and filter bar are untouched.

- [ ] **Step 1: Add imports**

At the top of the import block add:
```tsx
import { type ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/ui/data-table";
```

- [ ] **Step 2: Replace the `AssetTable` function**

Replace the entire `function AssetTable({ assets }: { assets: CampaignDetailAssetRow[] }) { ... }`
with the columns + a `DataTable` render. The empty-state copy matches the old
inline message. Keep the existing `Chip`, `SOURCE_TONE`, and `STATUS_TONE` helpers.

```tsx
const ASSET_COLUMNS: ColumnDef<CampaignDetailAssetRow>[] = [
  {
    id: "asset",
    header: "Asset",
    meta: { headClassName: "px-5", cellClassName: "px-5" },
    cell: ({ row }) => {
      const a = row.original;
      return (
        <div className="flex items-center gap-2.5">
          <ChannelLogo channel={a.channel} size={20} />
          <div>
            <div className="font-semibold text-[var(--text-primary)]">{a.title}</div>
            <div className="mt-0.5 text-xs text-[var(--text-secondary)]">
              {a.channel} · {a.format}
            </div>
          </div>
        </div>
      );
    },
  },
  {
    id: "source",
    header: "Source",
    cell: ({ row }) => <Chip className={SOURCE_TONE[row.original.source]}>{row.original.source}</Chip>,
  },
  {
    id: "impressions",
    header: "Impr.",
    meta: { align: "right", cellClassName: "font-mono tabular-nums text-[var(--text-secondary)]" },
    cell: ({ row }) => NUM.format(row.original.impressions),
  },
  {
    id: "clicks",
    header: "Clicks",
    meta: { align: "right", cellClassName: "font-mono tabular-nums text-[var(--text-secondary)]" },
    cell: ({ row }) => NUM.format(row.original.clicks),
  },
  {
    id: "leads",
    header: "Leads",
    meta: { align: "right", cellClassName: "font-mono font-semibold tabular-nums text-[var(--text-primary)]" },
    cell: ({ row }) => NUM.format(row.original.leads),
  },
  {
    id: "ctr",
    header: "CTR",
    meta: { align: "right", cellClassName: "font-mono tabular-nums text-[var(--text-secondary)]" },
    cell: ({ row }) => `${row.original.ctr}%`,
  },
  {
    id: "status",
    header: "Status",
    meta: { align: "right", headClassName: "px-5", cellClassName: "px-5" },
    cell: ({ row }) => <Chip className={STATUS_TONE[row.original.status]}>{row.original.status}</Chip>,
  },
];

function AssetTable({ assets }: { assets: CampaignDetailAssetRow[] }) {
  return (
    <DataTable
      columns={ASSET_COLUMNS}
      data={assets}
      getRowId={(a) => a.id}
      minWidth="min-w-[760px]"
      emptyState={<div className="text-sm text-[var(--text-muted)]">No assets match the current filters.</div>}
    />
  );
}
```

- [ ] **Step 3: Verify**

Run: `pnpm build` → succeeds.
Run: `pnpm exec eslint src/app/analytics/_components/campaign-detail-explorer.tsx` → no errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/analytics/_components/campaign-detail-explorer.tsx
git commit -m "refactor(analytics): campaign-detail asset table on shared DataTable"
```

---

## Task 11: Migrate the CRM object table

**Files:**
- Modify: `src/app/crm/_components/crm-object-table.tsx`

The richest surface. **Preserve:** the search box, MUI filter selects, the view-tab
strip, score rings, missing badges, persona tags, the pinned first-column accent
rail, single-click-select / double-click-open behavior, and pagination. **Change:**
the table engine moves to `DataTable`; the decorative (non-functional) sort chevrons
in headers are dropped; headers converge to the shared uppercase treatment; cell
rhythm converges to the shared `px-3 py-4` (no data is lost). Pagination moves into
`DataTable` (delete the manual page math + the bespoke footer pager).

Keep every helper unchanged: `getTableColumns`, `renderColumnContent`, `SignalSelect`,
`FilterSelect`, `ScoreRing`, `MissingBadge`, `Tag`, `viewHref`, `statusTone`,
`uniqueSorted`, `humanizeTag`, `formatMissingField`, `formatRelative`,
`formatCrmDate`. Remove `pageNumbers` (no longer used).

- [ ] **Step 1: Swap imports**

Add to the import block:
```tsx
import { type ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/ui/data-table";
```
Remove `ChevronLeft`, `ChevronRight`, `ChevronsUpDown` from the lucide-react import
(keep `ArrowRight` and `Search`). Remove the `buttonClasses` import if it becomes
unused after deleting the footer pager (confirm by search).

- [ ] **Step 2: Remove manual pagination state + derived slice**

Delete:
```tsx
const [page, setPage] = useState(1);
...
const pageCount = Math.max(1, Math.ceil(filteredRows.length / pageSize));
const currentPage = Math.min(page, pageCount);
const startIndex = filteredRows.length === 0 ? 0 : (currentPage - 1) * pageSize;
const endIndex = Math.min(startIndex + pageSize, filteredRows.length);
const visibleRows = filteredRows.slice(startIndex, endIndex);
```
Keep `const [pageSize, setPageSize] = useState(8);`. Remove every `resetPage();`
call (DataTable auto-resets the page when `filteredRows` changes); delete the
`resetPage` function. In the search `onChange` and the two `SignalSelect`
`onChange` handlers, drop the `resetPage()` line (keep the `setQuery` /
`setDataFilter` / `setPersonaFilter` lines).

- [ ] **Step 3: Keep the click/keyboard handlers, drop per-cell wiring**

Keep `clickTimeoutRef`, the cleanup `useEffect`, `selectedHref`, `selectRecord`,
`openRecord`, `scheduleSelectRecord`, and `openRecordFromDoubleClick`. Delete
`handleRowKeyDown` (the wrapper handles row keyboard). These now attach at the row
level via `DataTable`'s `onRowClick` / `onRowDoubleClick`.

- [ ] **Step 4: Build TanStack columns from the existing presets**

Add this `useMemo` right after the existing `tableColumns` memo (which yields
`{ key, header }[]`). It maps each preset column to a `ColumnDef`, reusing
`renderColumnContent`, and appends the trailing "open" arrow column:

```tsx
const columnDefs = useMemo<ColumnDef<CrmObjectRow>[]>(() => {
  const defs: ColumnDef<CrmObjectRow>[] = tableColumns.map((column) => ({
    id: column.key,
    header: column.header,
    cell: ({ row }) => renderColumnContent(column.key, row.original, selectedRecordId === row.original.id),
  }));

  defs.push({
    id: "open",
    header: "",
    meta: { width: "w-9", align: "right" },
    cell: ({ row }) => (
      <button
        aria-label={`Open ${row.original.name}`}
        className="flex h-full w-full cursor-pointer items-center justify-center px-2 text-[var(--text-muted)] transition-colors duration-300 group-hover:text-[var(--accent)]"
        onClick={(event) => {
          event.stopPropagation();
          openRecord(row.original);
        }}
        type="button"
      >
        <ArrowRight
          aria-hidden
          className="h-4 w-4 shrink-0 -translate-x-0.5 opacity-0 transition-all duration-200 ease-out group-hover:translate-x-0 group-hover:opacity-100"
          strokeWidth={1.9}
        />
      </button>
    ),
  });

  return defs;
}, [tableColumns, selectedRecordId]);
```

Note: `renderColumnContent` already returns the per-cell visuals; the wrapper draws
the accent rail (via `pinnedAccentRail`), so the manual `<span className="absolute ...
bg-[var(--accent)]">` rail inside the old table markup is no longer needed.

- [ ] **Step 5: Replace the table markup + footer with DataTable**

Replace everything from `<div className="overflow-x-auto">` (the `<table>` … its
closing `</div>`, including the inline empty-state `<div>`) AND the entire footer
`<div className="flex flex-col gap-3 border-t …">…</div>` (the bespoke pager with
`pageNumbers`, the prev/next buttons, and the rows-per-page `SignalSelect`) — i.e.
the whole region after the toolbar `</div>` — with:

```tsx
<DataTable
  columns={columnDefs}
  data={filteredRows}
  getRowId={(row) => row.id}
  onRowClick={scheduleSelectRecord}
  onRowDoubleClick={openRecordFromDoubleClick}
  isSelected={(row) => selectedRecordId === row.id}
  pinnedAccentRail
  pageSize={pageSize}
  paginationLabel="records"
  minWidth="min-w-[900px]"
  emptyState={
    <EmptyState
      title={activeView === "all-records" ? `No ${objectLabel.toLowerCase()} found` : `No ${activeViewLabel.toLowerCase()} records found`}
      detail={normalizedQuery ? `No records match "${query.trim()}". Clear the search or try another term.` : "No records match this CRM view yet."}
    />
  }
/>
```

The rows-per-page control: the old footer had a `SignalSelect` bound to `pageSize`.
Re-add a compact rows-per-page control inside the existing top toolbar grid (next to
the other `SignalSelect`s) so the capability is preserved:

```tsx
<SignalSelect
  label="Rows per page"
  compact
  onChange={(value) => setPageSize(Number(value))}
  value={String(pageSize)}
>
  {PAGE_SIZES.map((size) => (
    <MenuItem key={size} value={String(size)}>
      {size} / page
    </MenuItem>
  ))}
</SignalSelect>
```
Place it as a 5th control: change the toolbar grid template from
`xl:grid-cols-[minmax(260px,1fr)_180px_160px_150px]` to
`xl:grid-cols-[minmax(240px,1fr)_170px_150px_140px_130px]`.

- [ ] **Step 6: Delete the now-unused `pageNumbers` helper**

Remove `function pageNumbers(...)` at the bottom of the file.

- [ ] **Step 7: Verify**

Run: `pnpm build` → succeeds.
Run: `pnpm exec eslint src/app/crm/_components/crm-object-table.tsx` → no errors
(resolve unused-import/var warnings for the removed chevrons, `buttonClasses`,
`pageNumbers`, `handleRowKeyDown`).

- [ ] **Step 8: Commit**

```bash
git add src/app/crm/_components/crm-object-table.tsx
git commit -m "refactor(crm): object table on shared DataTable (preserve select/open + accent rail)"
```

---

## Task 12: Delete the legacy table + final verification

**Files:**
- Delete: `src/app/_components/data-table.tsx`

- [ ] **Step 1: Confirm no remaining importers**

Run (PowerShell-safe via Grep tool or):
`pnpm exec eslint --no-eslintrc -v >/dev/null 2>&1; grep -rn "_components/data-table" src` (or use the Grep tool for `_components/data-table`).
Expected: **zero** matches. If any remain, migrate them using the Task 3 pattern
before deleting.

- [ ] **Step 2: Delete the legacy file**

```bash
git rm src/app/_components/data-table.tsx
```

- [ ] **Step 3: Full build + lint + domain tests**

Run: `pnpm build`
Expected: succeeds, no type errors.
Run: `pnpm test`
Expected: existing domain tests pass (unchanged).
Run: `pnpm exec eslint src/components/ui/table.tsx src/components/ui/data-table.tsx src/app/brain/_components/brain-browser.tsx src/app/analytics/_components/overview/campaign-performance-table.tsx src/app/analytics/_components/overview/analytics-explorer.tsx src/app/analytics/_components/overview/campaign-comparison-table.tsx src/app/analytics/page.tsx "src/app/agent-operations/[agentKey]/page.tsx" "src/app/agent-operations/[agentKey]/_components/agent-task-table.tsx" src/app/agent-operations/agent-task-board.tsx src/app/approvals/approval-history-table.tsx src/app/analytics/_components/campaign-detail-explorer.tsx src/app/crm/_components/crm-object-table.tsx`
Expected: no errors.

- [ ] **Step 4: Preview verification (DOM checks, not screenshots)**

Start the dev server (`preview_start`) and, for each route, confirm a `<table data-slot="table">` renders with rows and the expected header/hover/selected styling via `preview_eval` / `preview_snapshot` (avoid `preview_screenshot` on particle pages):
- `/brain` — Brain table renders rows.
- `/analytics` — campaign performance + explorer tables render; filter bar still re-derives the table.
- `/agent-operations` — task board: search + filter tabs + pagination work; changing a filter resets to page 1.
- `/agent-operations/<agentKey>` — agent detail task table renders + row links.
- `/approvals` — history: search + decision tabs + pagination work; rows link to campaign/approval.
- `/analytics/<campaignId>` — asset table renders with source/status chips.
- `/crm/companies` (and one `[recordId]`) — single-click selects a row (accent rail appears), double-click opens it, the trailing arrow opens on click, rows-per-page + pagination work.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(ui): remove legacy DataTable; app-wide tables on shadcn Data Table"
```

---

## Self-Review (completed by plan author)

**Spec coverage:**
- Primitive (`ui/table.tsx`) + TanStack wrapper → Tasks 1-2. ✓
- Signal theming / no shadcn-default leak → primitive uses only Signal tokens (Task 1). ✓
- Replace shared `DataTable` + repoint 6 consumers → Tasks 3-8 (brain, 2 analytics tables, analytics page, agent-ops detail, agent task board). ✓
- Rebuild CRM preserving UX → Task 11 (select/open, accent rail, score rings, pagination). ✓
- Rebuild Approvals history → Task 9. ✓
- Convert `campaign-detail-explorer` raw table → Task 10. ✓
- Leave pipeline board + Arc chat markdown table alone → not touched (no task). ✓
- Add `@tanstack/react-table` → Task 1. ✓
- Verification via build/lint/test/preview → every task + Task 12. ✓

**Deviations from spec (intentional, noted for reviewer):**
1. **Wrapper lives at `src/components/ui/data-table.tsx`** (spec said delete the old
   `app/_components/data-table.tsx` and put it under `ui/`). Done exactly — but the
   wrapper is created at the new path first and the old file deleted last (Task 12)
   so every intermediate task compiles green.
2. **Two new thin client components** (`campaign-comparison-table.tsx`,
   `agent-task-table.tsx`) were not named in the spec; they are required because the
   wrapper is a client component and those two pages are server components passing
   `cell` functions (RSC boundary). This is the documented RSC-safe pattern.
3. **CRM headers converge to the shared uppercase treatment and decorative sort
   chevrons are dropped.** The chevrons were non-functional (no sort was wired). All
   actual craft — cell content, select/open, accent rail — is preserved. Real
   per-column sorting is now a trivial follow-up (`enableSorting` + accessors).
4. **Built-in global search was cut (YAGNI).** Every consumer has its own rich
   search/filter UI; a generic search box on the wrapper would be unused.

**Placeholder scan:** none — every code step shows complete code. ✓
**Type consistency:** `DataTableProps` (`columns`/`data`/`getRowId`/`rowHref`/
`onRowClick`/`onRowDoubleClick`/`isSelected`/`enableSorting`/`pageSize`/
`paginationLabel`/`pinnedAccentRail`/`emptyState`/`minWidth`) is used consistently
across Tasks 3-11; `ComparisonRowData` is defined and exported once (Task 6) and
imported by the page. ✓
