"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";

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
        {project ? `New chat in ${project.name}` : `Give ${assistantName} a concrete job`}
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
          Name the audience, source, channel, or blocker. {assistantName} should return usable work, show the reasoning, and keep outbound locked for review.
        </p>
      )}
    </div>
  );
}

/** A pill linking to real pending work (approvals, opportunities) so the blank
 *  chat doubles as a launchpad instead of only offering prompts. */
function PendingWorkChip({ href, count, label }: { href: string; count: number; label: string }) {
  return (
    <Link
      href={href}
      className="group inline-flex items-center gap-2 rounded-full bg-[var(--surface-panel)] px-3.5 py-1.5 text-xs font-medium text-[var(--text-secondary)] shadow-[inset_0_0_0_1px_var(--border-hairline)] transition hover:text-[var(--text-primary)] hover:shadow-[inset_0_0_0_1px_var(--accent-border-strong)]"
    >
      <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--accent-soft)] px-1.5 text-[11px] font-semibold tabular-nums text-[var(--accent-strong)]">
        {count}
      </span>
      {label}
      <svg viewBox="0 0 20 20" aria-hidden className="h-3.5 w-3.5 -translate-x-1 text-[var(--text-muted)] opacity-0 transition-all group-hover:translate-x-0 group-hover:text-[var(--accent)] group-hover:opacity-100" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="m8 5 5 5-5 5" />
      </svg>
    </Link>
  );
}

export function ChatEmptyShortcuts({
  onPick,
  pendingApprovals,
  pendingOpportunities = 0,
}: {
  assistantName: string;
  onPick: (prompt: string) => void;
  pendingApprovals: number;
  pendingOpportunities?: number;
}) {
  const shortcuts: Shortcut[] = [
    {
      label: "Prepare a campaign packet",
      hint: "Audience, channels, copy, review list",
      prompt: "Prepare a campaign packet for @. Include audience, channel plan, draft copy, proof points, and what needs approval.",
      icon: ICON.draft,
    },
    {
      label: "Surface lead signals",
      hint: "Prospects with evidence, not guesses",
      prompt: "Find lead signals for @. Show why each one matters, the source, and the recommended next action.",
      icon: ICON.leads,
    },
    {
      label: "Review locked work",
      hint: "What is waiting, why it is locked",
      prompt: "List everything awaiting approval. For each item, show the risk, source, and the exact decision needed.",
      icon: ICON.review,
      badge: pendingApprovals > 0 ? pendingApprovals : undefined,
    },
    {
      label: "Brief a campaign",
      hint: "Status, blockers, next decision",
      prompt: "Brief my latest campaign. Cover status, open decisions, blocked pieces, launch readiness, and the next operator action.",
      icon: ICON.summarize,
    },
  ];

  const hasPendingWork = pendingOpportunities > 0 || pendingApprovals > 0;

  return (
    <div className="flex w-full max-w-[72rem] flex-col gap-3">
      {hasPendingWork ? (
        <div className="msg-rise flex flex-wrap items-center gap-2" style={{ animationDelay: "80ms" }} aria-label="Pending work">
          {pendingOpportunities > 0 ? (
            <PendingWorkChip
              href="/opportunities"
              count={pendingOpportunities}
              label={`opportunit${pendingOpportunities === 1 ? "y" : "ies"} to review`}
            />
          ) : null}
          {pendingApprovals > 0 ? (
            <PendingWorkChip
              href="/approvals"
              count={pendingApprovals}
              label={`awaiting approval`}
            />
          ) : null}
        </div>
      ) : null}
      <div className="msg-rise grid gap-2 sm:grid-cols-2 2xl:grid-cols-4" style={{ animationDelay: "120ms" }}>
        {shortcuts.map((s) => (
        <button
          key={s.label}
          type="button"
          onClick={() => onPick(s.prompt)}
          className="group flex items-start gap-3 rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-panel)] px-4 py-3.5 text-left transition-colors duration-200 hover:border-[var(--accent-border-strong)] hover:bg-[var(--surface-soft)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] active:translate-y-px"
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--surface-inset)] text-[var(--accent)] shadow-[inset_0_0_0_1px_var(--border-strong)] transition-colors group-hover:bg-[var(--surface-raised)] group-hover:text-[var(--accent-strong)]">
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
            <span className="line-clamp-2 text-xs leading-5 text-[var(--text-muted)]">{s.hint}</span>
          </span>
          <svg
            viewBox="0 0 20 20"
            aria-hidden
            className="mt-0.5 h-4 w-4 shrink-0 -translate-x-1 self-center text-[var(--text-muted)] opacity-0 transition-all duration-200 group-hover:translate-x-0 group-hover:text-[var(--accent)] group-hover:opacity-100"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m8 5 5 5-5 5" />
          </svg>
        </button>
        ))}
      </div>
    </div>
  );
}
