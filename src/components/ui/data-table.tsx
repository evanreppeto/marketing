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
