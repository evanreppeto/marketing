/**
 * Frontend reset placeholder.
 *
 * Every route currently renders this inside the persistent app shell
 * (ConsoleFrame). It marks the page as intentionally blank while the frontend
 * is rebuilt. Replace a route's `page.tsx` with real content to bring it back.
 */
export function BlankPage() {
  return (
    <div className="flex min-h-[70vh] items-center justify-center">
      <p className="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
        Blank
      </p>
    </div>
  );
}
