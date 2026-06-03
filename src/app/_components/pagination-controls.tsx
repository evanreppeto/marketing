"use client";

type PaginationControlsProps = {
  currentPage: number;
  endIndex: number;
  itemLabel: string;
  onPageChange: (page: number) => void;
  pageCount: number;
  startIndex: number;
  total: number;
};

export function PaginationControls({
  currentPage,
  endIndex,
  itemLabel,
  onPageChange,
  pageCount,
  startIndex,
  total,
}: PaginationControlsProps) {
  const visibleLabel = total === 0 ? `No ${itemLabel} matched` : `Showing ${startIndex + 1}-${endIndex} of ${total} ${itemLabel}`;

  return (
    <div className="flex flex-col gap-3 border-t border-[var(--border-hairline)] bg-[var(--surface-soft)] px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
      <div className="rounded-md border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-3 py-2 text-sm font-semibold text-[var(--text-secondary)]">
        <span className="text-[var(--text-primary)]">Page {currentPage} of {pageCount}</span>
        <span className="ml-2 font-normal text-[var(--text-muted)]">{visibleLabel}</span>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          className="min-h-10 cursor-pointer rounded-md border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-4 text-sm font-bold text-[var(--text-primary)] transition hover:border-[var(--accent)] hover:bg-[var(--surface-raised)] disabled:cursor-not-allowed disabled:opacity-45"
          disabled={currentPage <= 1}
          onClick={() => onPageChange(Math.max(1, currentPage - 1))}
          type="button"
        >
          Previous
        </button>
        {visiblePageNumbers(currentPage, pageCount).map((pageNumber) => (
          <button
            aria-current={pageNumber === currentPage ? "page" : undefined}
            className={`min-h-10 min-w-10 cursor-pointer rounded-md border px-3 text-sm font-bold transition hover:border-[var(--accent)] hover:bg-[var(--surface-raised)] ${
              pageNumber === currentPage
                ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text-primary)]"
                : "border-[var(--border-hairline)] bg-[var(--surface-inset)] text-[var(--text-secondary)]"
            }`}
            key={pageNumber}
            onClick={() => onPageChange(pageNumber)}
            type="button"
          >
            {pageNumber}
          </button>
        ))}
        <button
          className="min-h-10 cursor-pointer rounded-md border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-4 text-sm font-bold text-[var(--text-primary)] transition hover:border-[var(--accent)] hover:bg-[var(--surface-raised)] disabled:cursor-not-allowed disabled:opacity-45"
          disabled={currentPage >= pageCount}
          onClick={() => onPageChange(Math.min(pageCount, currentPage + 1))}
          type="button"
        >
          Next
        </button>
      </div>
    </div>
  );
}

function visiblePageNumbers(currentPage: number, pageCount: number) {
  if (pageCount <= 5) {
    return Array.from({ length: pageCount }, (_, index) => index + 1);
  }

  const start = Math.max(1, Math.min(currentPage - 2, pageCount - 4));
  return Array.from({ length: 5 }, (_, index) => start + index);
}
