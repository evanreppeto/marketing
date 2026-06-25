import Link from "next/link";

import type { ArcActionCard } from "@/domain";

/** A one-click deep link into a pre-filtered app view. Renders only for
 *  kind:"navigate" cards that carry a validated in-app appState. */
export function NavigateCard({ card }: { card: ArcActionCard }) {
  if (!card.appState) return null;
  const { href, filters } = card.appState;
  return (
    <div className="mt-3 flex items-center gap-3 rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-3 py-2.5">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--accent-soft)] text-[var(--accent)]" aria-hidden>
        <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 5h14M3 10h14M3 15h9" />
        </svg>
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-[var(--text-primary)]">{card.title}</div>
        {filters.length > 0 ? (
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-[var(--text-muted)]">
            <span>pre-filtered</span>
            {filters.map((f, i) => (
              <span key={`${i}-${f}`} className="rounded border border-[var(--border-hairline)] bg-[var(--surface-raised)] px-1.5 py-0.5 text-[var(--text-secondary)]">
                {f}
              </span>
            ))}
          </div>
        ) : null}
      </div>
      <Link href={href} className="flex shrink-0 items-center gap-1.5 text-xs font-semibold text-[var(--accent-contrast)] transition hover:text-[var(--accent)]">
        Open view
        <svg viewBox="0 0 20 20" aria-hidden className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 10h10M11 5l5 5-5 5" />
        </svg>
      </Link>
    </div>
  );
}
