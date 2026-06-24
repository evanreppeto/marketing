import { cx } from "./theme";

/**
 * Approval-gated draft card used in-flow (Arc replies, Activity, Campaign
 * builder, Outbox). The body is whatever draft preview the caller passes; the
 * footer carries the decision controls — pass the GOLD primary "Approve" as the
 * single focal action, with ghost revise/decline. The "Outbound stays locked"
 * badge keeps the human gate visible. Action nodes are slots so callers can wire
 * real server-action <form> submits; this stays server-renderable (no hooks).
 */
export function InlineApprovalCard({
  title,
  meta,
  children,
  approve,
  requestRevision,
  decline,
  locked = true,
  lockLabel = "Outbound stays locked",
  className = "",
}: {
  title: React.ReactNode;
  /** Small right-aligned meta on the title row, e.g. a StatusPill or timestamp. */
  meta?: React.ReactNode;
  /** The draft preview body. */
  children: React.ReactNode;
  /** The single focal action — pass a gold primary Button or a submit button. */
  approve: React.ReactNode;
  requestRevision?: React.ReactNode;
  decline?: React.ReactNode;
  locked?: boolean;
  lockLabel?: string;
  className?: string;
}) {
  return (
    <section
      className={cx(
        "overflow-hidden rounded-[10px] border border-[var(--border-panel)] bg-[var(--surface-panel)]",
        className,
      )}
    >
      <header className="flex items-center justify-between gap-3 border-b border-[var(--border-hairline)] px-4 py-2.5">
        <div className="min-w-0 truncate text-sm font-semibold text-[var(--text-primary)]">{title}</div>
        {meta ? <div className="shrink-0">{meta}</div> : null}
      </header>

      <div className="px-4 py-3.5 text-sm leading-6 text-[var(--text-secondary)]">{children}</div>

      <footer className="flex flex-wrap items-center gap-2 border-t border-[var(--border-hairline)] bg-[var(--surface-inset)] px-4 py-3">
        {approve}
        {requestRevision}
        {decline}
        {locked ? (
          <span className="ml-auto inline-flex items-center gap-1.5 text-[11px] font-medium text-[var(--text-muted)]">
            <svg
              aria-hidden
              viewBox="0 0 16 16"
              className="h-3.5 w-3.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3.5" y="7" width="9" height="6" rx="1.5" />
              <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" />
            </svg>
            {lockLabel}
          </span>
        ) : null}
      </footer>
    </section>
  );
}
