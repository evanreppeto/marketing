"use client";

import { useState, type ReactNode } from "react";

import { ArcPersona } from "./arc-avatar";

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

/** Centered greeting for a fresh thread. Rendered as a sibling of the composer
 *  (not a wrapper around it) so the composer keeps its tree position when the
 *  first message lands — see the slot layout in ArcChat. */
/** Project context for a fresh chat scoped to a project (the ?project=<id> deep link). */
export type EmptyHeroProject = {
  name: string;
  chatCount: number;
  assetCount: number;
  thumbnails: string[];
};

export function ChatEmptyHero({
  assistantName,
  operatorName,
  project = null,
}: {
  assistantName: string;
  operatorName: string | null;
  project?: EmptyHeroProject | null;
}) {
  // Stable per-mount hour; suppressHydrationWarning guards the tiny window where
  // server and client render across an hour boundary.
  const [hour] = useState(() => new Date().getHours());

  return (
    <div className="msg-rise flex flex-col items-center gap-3 text-center" style={{ animationDelay: "0ms" }}>
      <ArcPersona state="idle" size={112} className="arc-persona--hero mb-2" />
      {project ? (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--surface-inset)] px-2.5 py-1 text-xs font-medium text-[var(--text-secondary)] shadow-[inset_0_0_0_1px_var(--border-strong)]">
          <svg viewBox="0 0 20 20" aria-hidden className="h-3.5 w-3.5 text-[var(--accent)]" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2.5 5.5A1.5 1.5 0 0 1 4 4h3l2 2.5h5a1.5 1.5 0 0 1 1.5 1.5v6.5a1.5 1.5 0 0 1-1.5 1.5H4a1.5 1.5 0 0 1-1.5-1.5z" />
          </svg>
          {project.name}
        </span>
      ) : (
        <p className="text-sm text-[var(--text-muted)]" suppressHydrationWarning>
          {greeting(hour)}
          {operatorName ? `, ${operatorName}` : ""}.
        </p>
      )}
      <h2 className="font-display text-[clamp(1.7rem,3.2vw,2.15rem)] font-bold leading-[1.04] tracking-[-0.035em] text-[var(--text-primary)]">
        {project ? `New chat in ${project.name}` : `What should ${assistantName} work on?`}
      </h2>
      {project ? (
        <>
          <p className="max-w-[48ch] text-sm leading-6 text-[var(--text-secondary)]">
            {assistantName} can build on this project&rsquo;s work
            {project.chatCount > 0 ? ` — ${project.chatCount} chat${project.chatCount === 1 ? "" : "s"}` : ""}
            {project.assetCount > 0
              ? `${project.chatCount > 0 ? " and " : " — "}${project.assetCount} asset${project.assetCount === 1 ? "" : "s"}`
              : ""}
            {project.chatCount > 0 || project.assetCount > 0 ? " already here." : "."} Outbound stays locked until you approve.
          </p>
          {project.thumbnails.length > 0 ? (
            <div className="mt-1 flex items-center gap-1.5" aria-label="Recent assets in this project">
              {project.thumbnails.map((src, i) => (
                <span key={`${i}-${src}`} className="h-12 w-12 overflow-hidden rounded-lg shadow-[inset_0_0_0_1px_var(--border-strong)]">
                  {/* eslint-disable-next-line @next/next/no-img-element -- signed URL, no optimizer config */}
                  <img src={src} alt="" className="h-full w-full object-cover" />
                </span>
              ))}
            </div>
          ) : null}
        </>
      ) : (
        <p className="max-w-[46ch] text-sm leading-6 text-[var(--text-secondary)]">
          Ask about a campaign, lead, or persona. {assistantName} drafts and recommends — you approve what goes out.
        </p>
      )}
    </div>
  );
}

export function ChatEmptyShortcuts({
  assistantName,
  onPick,
  pendingApprovals,
}: {
  assistantName: string;
  onPick: (prompt: string) => void;
  pendingApprovals: number;
}) {
  const shortcuts: Shortcut[] = [
    { label: "Draft a campaign", hint: `${assistantName} drafts; you approve`, prompt: "Draft a campaign for @", icon: ICON.draft },
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
    <div className="msg-rise grid w-full max-w-2xl gap-2 sm:grid-cols-2" style={{ animationDelay: "120ms" }}>
      {shortcuts.map((s) => (
        <button
          key={s.label}
          type="button"
          onClick={() => onPick(s.prompt)}
          className="group flex items-start gap-3 rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-panel)] px-4 py-3.5 text-left transition hover:border-[var(--accent-border-strong)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] active:translate-y-px"
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--surface-inset)] text-[var(--accent)] shadow-[inset_0_0_0_1px_var(--border-strong)]">
            <svg
              viewBox="0 0 20 20"
              aria-hidden
              className="h-4.5 w-4.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              {s.icon}
            </svg>
          </span>
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
  );
}
