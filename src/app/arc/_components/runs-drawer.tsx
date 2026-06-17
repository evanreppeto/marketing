"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { StatusPill } from "@/app/_components/page-header";
import type { ThemeTone } from "@/app/_components/theme";
import type { ArcRun, ArcRunStatus } from "@/lib/arc-chat/persistence";

import { getArcRunsAction } from "../actions";
import { relativeTime } from "./relative-time";
import { useDialogA11y } from "./use-dialog-a11y";

const ACTIVE_STATUSES: ArcRunStatus[] = ["queued", "running", "blocked", "needs_approval"];

function statusTone(status: ArcRunStatus): ThemeTone {
  switch (status) {
    case "completed":
      return "green";
    case "failed":
      return "red";
    case "running":
    case "blocked":
    case "needs_approval":
      return "amber";
    default:
      return "gray";
  }
}

function statusLabel(status: ArcRunStatus): string {
  switch (status) {
    case "needs_approval":
      return "Needs approval";
    case "completed":
      return "Done";
    default:
      return status.charAt(0).toUpperCase() + status.slice(1);
  }
}

/** mm:ss elapsed since a start time — shown live for in-flight runs. */
function elapsed(fromIso: string | null, nowMs: number): string {
  if (!fromIso) return "";
  const start = new Date(fromIso).getTime();
  if (Number.isNaN(start)) return "";
  const secs = Math.max(0, Math.floor((nowMs - start) / 1000));
  const mm = String(Math.floor(secs / 60)).padStart(2, "0");
  const ss = String(secs % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

function RunRow({ run, nowMs, onClose }: { run: ArcRun; nowMs: number; onClose: () => void }) {
  const isActive = ACTIVE_STATUSES.includes(run.status);
  const time = isActive ? elapsed(run.startedAt ?? run.createdAt, nowMs) : relativeTime(run.completedAt ?? run.createdAt, nowMs);
  const title = run.title ?? "Untitled thread";

  const body = (
    <>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-sm font-medium text-[var(--text-primary)]">{title}</span>
        {run.objective ? <span className="truncate text-[11px] text-[var(--text-muted)]">{run.objective}</span> : null}
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1">
        <StatusPill tone={statusTone(run.status)}>{statusLabel(run.status)}</StatusPill>
        <span className="text-[10px] tabular-nums text-[var(--text-muted)]">{time}</span>
      </span>
    </>
  );

  const cls =
    "flex items-start justify-between gap-3 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-soft)] px-3 py-2.5 transition";

  return run.conversationId ? (
    <Link href={`/arc?c=${run.conversationId}`} onClick={onClose} className={`${cls} hover:border-[var(--accent-border-strong)] hover:bg-[var(--surface-inset)]`}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

function Section({ label, runs, nowMs, onClose }: { label: string; runs: ArcRun[]; nowMs: number; onClose: () => void }) {
  if (runs.length === 0) return null;
  return (
    <div className="flex flex-col gap-1.5">
      <p className="px-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
        {label} · {runs.length}
      </p>
      {runs.map((r) => (
        <RunRow key={r.taskId} run={r} nowMs={nowMs} onClose={onClose} />
      ))}
    </div>
  );
}

/**
 * Global Runs view — every Arc run across all threads (active + recent), polled
 * live while open. The Codex-style "see what's running and when it's done"
 * surface. Reads the agent_tasks queue; empty when Supabase isn't configured.
 */
export function RunsDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [runs, setRuns] = useState<ArcRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const panelRef = useDialogA11y<HTMLDivElement>(open);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    async function tick() {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      try {
        const next = await getArcRunsAction();
        if (alive) {
          setRuns(next);
          setError(false);
          setLoading(false);
        }
      } catch {
        if (alive) {
          setError(true);
          setLoading(false);
        }
      }
    }
    void tick();
    const poll = setInterval(tick, 4000);
    const clock = setInterval(() => setNowMs(Date.now()), 1000);
    function onVisible() {
      if (document.visibilityState === "visible") void tick();
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      clearInterval(poll);
      clearInterval(clock);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const active = runs.filter((r) => ACTIVE_STATUSES.includes(r.status));
  const recent = runs.filter((r) => !ACTIVE_STATUSES.includes(r.status));

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button aria-label="Close runs" className="absolute inset-0 bg-[var(--overlay)] backdrop-blur-sm" onClick={onClose} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Arc runs"
        tabIndex={-1}
        className="relative flex h-full w-full max-w-[440px] flex-col overflow-hidden border-l border-[var(--border-panel)] bg-[var(--surface-panel)] shadow-[var(--elev-panel)] outline-none"
      >
        <div className="flex items-center justify-between border-b border-[var(--border-hairline)] bg-[var(--surface-inset)]/40 px-5 py-3.5">
          <div className="flex items-baseline gap-2">
            <h2 className="font-display text-lg font-semibold tracking-[-0.01em] text-[var(--text-primary)]">Runs</h2>
            <span className="text-xs text-[var(--text-muted)]">
              {active.length > 0 ? `${active.length} active` : "idle"}
            </span>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-md text-[var(--text-muted)] transition hover:bg-[var(--surface-raised)] hover:text-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
          >
            <svg viewBox="0 0 20 20" aria-hidden className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="m5 5 10 10M15 5 5 15" />
            </svg>
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
          {loading ? (
            <p className="text-xs text-[var(--text-muted)]">Loading runs…</p>
          ) : error && runs.length === 0 ? (
            <div className="rounded-lg border border-dashed border-[var(--border-hairline)] p-6 text-center">
              <p className="text-sm font-medium text-[var(--text-primary)]">Couldn&rsquo;t load runs</p>
              <p className="mx-auto mt-1.5 max-w-[42ch] text-xs leading-5 text-[var(--text-muted)]">
                The run list is temporarily unavailable. It&rsquo;ll refresh on the next poll.
              </p>
            </div>
          ) : runs.length === 0 ? (
            <div className="rounded-lg border border-dashed border-[var(--border-hairline)] p-6 text-center">
              <p className="text-sm font-medium text-[var(--text-primary)]">No runs yet</p>
              <p className="mx-auto mt-1.5 max-w-[42ch] text-xs leading-5 text-[var(--text-muted)]">
                When Arc is working a thread, it shows up here with live status — queued, running, and done — across every conversation.
              </p>
            </div>
          ) : (
            <>
              <Section label="Active" runs={active} nowMs={nowMs} onClose={onClose} />
              <Section label="Recent" runs={recent} nowMs={nowMs} onClose={onClose} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
