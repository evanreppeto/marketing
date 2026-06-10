"use client";

import { useState, type ReactNode } from "react";

type Shortcut = {
  label: string;
  hint: string;
  prompt: string;
  icon: ReactNode;
  badge?: number;
};

function greeting(hour: number): string {
  if (hour < 5) return "Working late";
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

const ICON = {
  draft: (
    <path d="M4 13.5V16h2.5l8-8L12 5.5l-8 8zM11 6.5l2.5 2.5" />
  ),
  leads: (
    <>
      <circle cx="10" cy="10" r="6.5" />
      <circle cx="10" cy="10" r="2.5" />
      <path d="M10 1.5v2M10 16.5v2M1.5 10h2M16.5 10h2" />
    </>
  ),
  review: (
    <>
      <circle cx="10" cy="10" r="7" />
      <path d="m6.8 10.2 2.2 2.3 4.2-4.8" />
    </>
  ),
  summarize: (
    <path d="M4 5.5h12M4 10h12M4 14.5h7" />
  ),
} as const;

export function ChatEmptyState({
  onPick,
  composer,
  operatorName,
  pendingApprovals,
}: {
  onPick: (prompt: string) => void;
  composer?: ReactNode;
  operatorName: string | null;
  pendingApprovals: number;
}) {
  // Stable per-mount hour; suppressHydrationWarning guards the tiny window where
  // server and client render across an hour boundary.
  const [hour] = useState(() => new Date().getHours());

  const shortcuts: Shortcut[] = [
    { label: "Draft a campaign", hint: "Mark drafts; you approve", prompt: "Draft a campaign for @", icon: ICON.draft },
    { label: "Find new leads", hint: "Search and propose prospects", prompt: "Find new leads for @", icon: ICON.leads },
    {
      label: "Review pending",
      hint: "Everything awaiting your decision",
      prompt: "What's awaiting my approval right now, and the risk on each?",
      icon: ICON.review,
      badge: pendingApprovals > 0 ? pendingApprovals : undefined,
    },
    {
      label: "Summarize a campaign",
      hint: "Status, approvals, next steps",
      prompt: "Summarize my latest campaign — status, pending approvals, and what's next.",
      icon: ICON.summarize,
    },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-7 overflow-y-auto px-4 py-10 sm:px-6">
      <div className="msg-rise flex flex-col items-center gap-2.5 text-center" style={{ animationDelay: "0ms" }}>
        <p className="text-sm text-[var(--text-muted)]" suppressHydrationWarning>
          {greeting(hour)}
          {operatorName ? `, ${operatorName}` : ""}.
        </p>
        <h2 className="font-display text-[clamp(1.5rem,3vw,1.9rem)] font-bold leading-[1.05] tracking-[-0.03em] text-[var(--text-primary)]">
          What should Mark work on?
        </h2>
      </div>

      {composer ? (
        <div className="msg-rise w-full max-w-2xl" style={{ animationDelay: "60ms" }}>
          {composer}
        </div>
      ) : null}

      <div className="msg-rise grid w-full max-w-2xl gap-2 sm:grid-cols-2" style={{ animationDelay: "120ms" }}>
        {shortcuts.map((s) => (
          <button
            key={s.label}
            type="button"
            onClick={() => onPick(s.prompt)}
            className="flex items-center gap-3 rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-3.5 py-3 text-left transition hover:border-[var(--accent-border-strong)] hover:bg-[var(--surface-raised)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] active:translate-y-px"
          >
            <svg
              viewBox="0 0 20 20"
              aria-hidden
              className="h-4.5 w-4.5 shrink-0 text-[var(--accent)]"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              {s.icon}
            </svg>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="flex items-center gap-2 text-sm font-medium text-[var(--text-primary)]">
                {s.label}
                {s.badge ? (
                  <span className="rounded-full bg-[var(--priority-soft)] px-1.5 py-px text-[10px] font-semibold tabular-nums text-[var(--priority-text)]">
                    {s.badge}
                  </span>
                ) : null}
              </span>
              <span className="truncate text-xs text-[var(--text-muted)]">{s.hint}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
