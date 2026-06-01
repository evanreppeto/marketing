import type { ReactNode } from "react";

export type Column<T> = {
  /** stable key for the column */
  key: string;
  header: ReactNode;
  align?: "left" | "right";
  /** width utility, e.g. "w-10" */
  width?: string;
  headClassName?: string;
  cellClassName?: string;
  cell: (row: T) => ReactNode;
};

/**
 * Token-driven data table. Centralizes the thead treatment, row rhythm,
 * hover/selected states, horizontal-scroll wrapper, and empty state that were
 * previously copy-pasted across the CRM and approvals tables.
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  minWidth = "min-w-[880px]",
  isSelected,
  emptyState,
}: {
  columns: Array<Column<T>>;
  rows: T[];
  rowKey: (row: T) => string;
  minWidth?: string;
  isSelected?: (row: T) => boolean;
  emptyState?: ReactNode;
}) {
  return (
    <div className="overflow-x-auto">
      <table className={`w-full ${minWidth} border-separate border-spacing-0 text-left text-sm`}>
        <thead>
          <tr className="bg-[var(--surface-inset)] text-[11px] uppercase tracking-[0.16em] text-[var(--text-muted)]">
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={`px-3 py-3 ${column.align === "right" ? "text-right" : ""} ${column.width ?? ""} ${column.headClassName ?? ""}`}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const selected = isSelected?.(row) ?? false;

            return (
              <tr
                key={rowKey(row)}
                aria-current={selected ? "page" : undefined}
                className={`group transition hover:bg-[var(--surface-inset)] ${selected ? "bg-[var(--accent-soft)]" : ""}`}
              >
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={`border-t border-[var(--border-hairline)] px-3 py-4 align-top ${column.align === "right" ? "text-right" : ""} ${column.cellClassName ?? ""}`}
                  >
                    {column.cell(row)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
      {rows.length === 0 && emptyState ? (
        <div className="border-t border-[var(--border-hairline)] px-5 py-8">{emptyState}</div>
      ) : null}
    </div>
  );
}
