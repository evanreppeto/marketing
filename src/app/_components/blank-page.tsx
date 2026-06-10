/**
 * Frontend reset placeholder.
 *
 * Every route currently renders this inside the persistent app shell
 * (ConsoleFrame). It marks the page as intentionally blank while the frontend
 * is rebuilt. Replace a route's `page.tsx` with real content to bring it back.
 */
export function BlankPage() {
  return (
    <section className="signal-panel module-rise flex min-h-[62vh] items-center justify-center p-8">
      <div className="max-w-xl text-center">
        <p className="signal-eyebrow justify-center">Signal workspace</p>
        <h1 className="mt-3 font-display text-3xl font-bold tracking-[-0.04em] text-[var(--text-primary)]">
          Page queued for buildout
        </h1>
        <p className="mx-auto mt-3 max-w-[56ch] text-sm leading-6 text-[var(--text-secondary)]">
          This route is intentionally held in the same operations shell while its working surface is rebuilt.
        </p>
      </div>
    </section>
  );
}
