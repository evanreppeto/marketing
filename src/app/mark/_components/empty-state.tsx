"use client";

import type { ReactNode } from "react";

const CHIPS = [
  { label: "Find new leads", prompt: "Find new leads for @" },
  { label: "What needs my approval?", prompt: "What's awaiting my approval right now, and the risk on each?" },
  { label: "Draft a campaign", prompt: "Draft a campaign for @" },
  { label: "Hottest leads", prompt: "Which leads are hottest right now? Rank them by score and recent activity." },
];

export function ChatEmptyState({ onPick, composer }: { onPick: (prompt: string) => void; composer?: ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-6 overflow-y-auto px-6 py-10">
      <span
        aria-hidden
        className="msg-rise flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--accent)] font-display text-lg font-bold text-[var(--on-accent)]"
        style={{ animationDelay: "0ms" }}
      >
        M
      </span>
      <div className="msg-rise flex flex-col items-center gap-2 text-center" style={{ animationDelay: "70ms" }}>
        <h2 className="font-display text-[clamp(1.5rem,3vw,2rem)] font-bold leading-[1.05] tracking-[-0.03em] text-[var(--text-primary)]">
          What can Mark help with?
        </h2>
        <p className="max-w-[52ch] text-xs leading-5 text-[var(--text-muted)]">
          Mark can <span className="text-[var(--text-secondary)]">find leads</span> ·{" "}
          <span className="text-[var(--text-secondary)]">draft campaigns</span> ·{" "}
          <span className="text-[var(--text-secondary)]">reference your records &amp; memories</span> — outbound stays locked.
        </p>
      </div>

      {composer ? (
        <div className="msg-rise w-full max-w-2xl" style={{ animationDelay: "120ms" }}>
          {composer}
        </div>
      ) : null}

      <div className="msg-rise flex flex-wrap justify-center gap-2" style={{ animationDelay: "170ms" }}>
        {CHIPS.map((c) => (
          <button
            key={c.label}
            type="button"
            onClick={() => onPick(c.prompt)}
            className="rounded-full border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-3.5 py-1.5 text-xs font-semibold text-[var(--text-secondary)] transition hover:border-[var(--accent)] hover:text-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
          >
            {c.label}
          </button>
        ))}
      </div>
    </div>
  );
}
