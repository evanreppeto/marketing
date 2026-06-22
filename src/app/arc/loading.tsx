/**
 * Loading fallback for the Arc chat surface. The chat is full-height with its own
 * thread rail + message column, so it overrides the generic dashboard PageSkeleton
 * with a chat-shaped placeholder — a quiet rail + a few message rows + a composer
 * bar — so the swap to the live conversation reads as a fade, not a layout jump.
 */
export default function ArcLoading() {
  return (
    <div className="flex h-full min-h-0 animate-pulse flex-col lg:flex-row">
      {/* Thread rail */}
      <aside className="hidden w-72 shrink-0 flex-col gap-3 border-r border-[var(--border-panel)] bg-[var(--surface-panel)] p-3 lg:flex">
        <div className="h-9 rounded-lg bg-[var(--surface-inset)]" />
        <div className="mt-1 space-y-2">
          {Array.from({ length: 7 }).map((_, index) => (
            <div className="h-11 rounded-lg bg-[var(--surface-inset)]" key={index} />
          ))}
        </div>
      </aside>

      {/* Conversation column */}
      <section className="relative flex min-h-0 flex-1 flex-col lg:border-l lg:border-[var(--border-hairline)]">
        {/* Header */}
        <header className="flex min-h-12 items-center gap-3 border-b border-[var(--border-hairline)] px-4 py-2">
          <div className="h-7 w-7 rounded-full bg-[var(--surface-raised)]" />
          <div className="h-3.5 w-40 rounded bg-[var(--surface-raised)]" />
        </header>

        {/* Messages */}
        <div className="mx-auto flex w-full max-w-[92rem] flex-1 flex-col justify-end gap-4 px-4 py-6 sm:px-6 xl:px-8">
          <div className="ml-auto h-12 w-full max-w-[48rem] rounded-2xl bg-[var(--surface-inset)]" />
          <div className="mr-auto h-24 w-full max-w-[52rem] rounded-2xl bg-[var(--surface-inset)]" />
          <div className="ml-auto h-10 w-full max-w-[34rem] rounded-2xl bg-[var(--surface-inset)]" />
          <div className="mr-auto h-16 w-full max-w-[44rem] rounded-2xl bg-[var(--surface-inset)]" />
        </div>

        {/* Composer */}
        <div className="mx-auto w-full max-w-[92rem] px-4 pb-4 pt-2 sm:px-6 xl:px-8">
          <div className="h-20 rounded-2xl border border-[var(--border-panel)] bg-[var(--surface-panel)]" />
        </div>
      </section>

      <span className="sr-only">Loading Arc…</span>
    </div>
  );
}
