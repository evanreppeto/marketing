import Link from "next/link";
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
  rowHref,
  minWidth = "min-w-[880px]",
  isSelected,
  emptyState,
}: {
  columns: Array<Column<T>>;
  rows: T[];
  rowKey: (row: T) => string;
  rowHref?: (row: T) => string | null | undefined;
  minWidth?: string;
  isSelected?: (row: T) => boolean;
  emptyState?: ReactNode;
}) {
  return (
    <div className="overflow-x-auto">
      <table className={`w-full ${minWidth} border-separate border-spacing-0 text-left text-sm`}>
        <thead>
          <tr className="bg-[var(--surface-inset)] text-[11px] text-[var(--text-muted)]">
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
            const href = rowHref?.(row) ?? null;

            return (
              <tr
                key={rowKey(row)}
                aria-current={selected ? "page" : undefined}
                className={`group transition duration-150 ${
                  href
                    ? "cursor-pointer hover:bg-[var(--surface-raised)] focus-within:bg-[var(--surface-raised)]"
                    : "hover:bg-[var(--surface-inset)]"
                } ${selected ? "bg-[var(--accent-soft)]" : ""}`}
              >
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={`border-t border-[var(--border-hairline)] align-top ${href ? "p-0" : "px-3 py-4"} ${column.align === "right" ? "text-right" : ""} ${column.cellClassName ?? ""}`}
                  >
                    {href ? (
                      <Link
                        className={`block h-full px-3 py-4 text-inherit no-underline outline-none transition focus-visible:bg-[var(--accent-soft)] ${
                          column.align === "right" ? "text-right" : "text-left"
                        }`}
                        href={href}
                      >
                        {column.cell(row)}
                      </Link>
                    ) : (
                      column.cell(row)
                    )}
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
