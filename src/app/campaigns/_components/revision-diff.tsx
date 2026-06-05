"use client";

import { useState } from "react";

import { diffLines } from "@/lib/campaigns/revision-diff";

export function RevisionDiff({ draft, current }: { draft: string; current: string }) {
  const [open, setOpen] = useState(false);
  const lines = diffLines(draft, current);
  const added = lines.filter((l) => l.kind === "added").length;
  const removed = lines.filter((l) => l.kind === "removed").length;

  return (
    <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-soft)]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
      >
        <span className="text-xs font-black uppercase tracking-[0.12em] text-[var(--text-muted)]">What changed</span>
        <span className="font-mono text-xs font-bold tabular-nums">
          <span className="text-[var(--ok)]">+{added}</span> <span className="text-[var(--priority-bright)]">−{removed}</span>
          <span className="ml-2 text-[var(--text-muted)]">{open ? "Hide" : "Show"}</span>
        </span>
      </button>
      {open ? (
        <pre className="max-h-[40vh] overflow-auto border-t border-[var(--border-hairline)] px-3 py-2 text-xs leading-5">
          {lines.map((line, index) => (
            <div
              key={index}
              className={
                line.kind === "added"
                  ? "bg-[oklch(0.78_0.14_158/0.12)] text-[oklch(0.88_0.1_158)]"
                  : line.kind === "removed"
                    ? "bg-[oklch(0.68_0.2_26/0.12)] text-[oklch(0.86_0.09_26)] line-through decoration-[oklch(0.68_0.2_26/0.5)]"
                    : "text-[var(--text-secondary)]"
              }
            >
              <span aria-hidden className="mr-2 select-none text-[var(--text-muted)]">
                {line.kind === "added" ? "+" : line.kind === "removed" ? "−" : " "}
              </span>
              {line.text || " "}
            </div>
          ))}
        </pre>
      ) : null}
    </div>
  );
}
