/**
 * Generic loading skeleton shown (via loading.tsx) while a page's dynamic
 * Supabase data streams in. Mirrors the common page shape — a header band, a
 * stat row, and a two-column body — so the shell stays put and the swap to real
 * content is a quiet fade rather than a snap.
 */
export function PageSkeleton() {
  return (
    <div className="animate-pulse">
      {/* Header band */}
      <div className="rounded-xl border border-[var(--border-panel)] bg-[var(--surface-panel)] px-5 py-6 shadow-[var(--elev-panel)]">
        <div className="h-3 w-28 rounded bg-[var(--surface-raised)]" />
        <div className="mt-3 h-7 w-2/3 rounded bg-[var(--surface-raised)]" />
        <div className="mt-3 h-3 w-1/2 rounded bg-[var(--surface-inset)]" />
      </div>

      {/* Stat row */}
      <div className="mt-4 grid gap-4 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div className="signal-panel h-24" key={index}>
            <div className="h-2.5 w-16 rounded bg-[var(--surface-raised)]" />
            <div className="mt-3 h-6 w-12 rounded bg-[var(--surface-raised)]" />
          </div>
        ))}
      </div>

      {/* Two-column body */}
      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="signal-panel space-y-3">
          <div className="h-4 w-40 rounded bg-[var(--surface-raised)]" />
          {Array.from({ length: 5 }).map((_, index) => (
            <div className="flex items-center gap-3" key={index}>
              <div className="h-9 flex-1 rounded bg-[var(--surface-inset)]" />
              <div className="h-9 w-20 rounded bg-[var(--surface-inset)]" />
            </div>
          ))}
        </div>
        <div className="signal-panel space-y-3">
          <div className="h-4 w-32 rounded bg-[var(--surface-raised)]" />
          {Array.from({ length: 4 }).map((_, index) => (
            <div className="h-12 rounded bg-[var(--surface-inset)]" key={index} />
          ))}
        </div>
      </div>
      <span className="sr-only">Loading…</span>
    </div>
  );
}
