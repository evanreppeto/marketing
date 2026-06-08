"use client";

const SUGGESTIONS = [
  {
    title: "Summarize my latest campaign",
    hint: "Status, pending approvals, what's next",
    prompt: "Summarize my latest campaign — its status, what's pending approval, and what I should do next.",
  },
  {
    title: "Which leads are hottest?",
    hint: "Ranked by score and recent activity",
    prompt: "Which leads are hottest right now? Rank them by score and recent activity.",
  },
  {
    title: "Draft a campaign",
    hint: "For a persona you choose",
    prompt: "Draft a campaign for @",
  },
  {
    title: "What needs my approval?",
    hint: "Everything waiting on a decision",
    prompt: "What's awaiting my approval right now, and what's the risk on each?",
  },
];

export function ChatEmptyState({ onPick }: { onPick: (prompt: string) => void }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-8 overflow-y-auto px-6 py-10">
      <div className="flex max-w-xl flex-col items-center gap-4 text-center">
        <span
          aria-hidden
          className="msg-rise flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--accent)] font-display text-xl font-black text-[var(--on-accent)] shadow-[var(--accent-glow)]"
          style={{ animationDelay: "0ms" }}
        >
          M
        </span>
        <div className="msg-rise" style={{ animationDelay: "70ms" }}>
          <h2 className="font-display text-[clamp(1.6rem,3.2vw,2.2rem)] font-black leading-[1.05] tracking-[-0.03em] text-[var(--text-primary)]">
            What can Mark help with?
          </h2>
          <p className="mx-auto mt-3 max-w-[46ch] text-sm leading-6 text-[var(--text-secondary)]">
            Ask about a campaign, a lead, or a persona. Type{" "}
            <span className="font-mono text-[var(--accent)]">@</span> to reference a record. Mark recommends; outbound
            stays locked.
          </p>
        </div>
      </div>

      <div className="grid w-full max-w-2xl grid-cols-1 gap-2.5 sm:grid-cols-2">
        {SUGGESTIONS.map((s, i) => (
          <button
            key={s.title}
            type="button"
            onClick={() => onPick(s.prompt)}
            style={{ animationDelay: `${140 + i * 55}ms` }}
            className="msg-rise group rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-4 py-3 text-left transition duration-200 ease-out hover:-translate-y-0.5 hover:border-[var(--accent)] hover:bg-[var(--surface-raised)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
          >
            <span className="block text-sm font-semibold text-[var(--text-primary)] transition group-hover:text-[var(--accent-contrast)]">
              {s.title}
            </span>
            <span className="mt-0.5 block text-xs leading-5 text-[var(--text-muted)]">{s.hint}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
