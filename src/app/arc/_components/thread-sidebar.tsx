"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

import { cx } from "@/app/_components/theme";
import type { ArcConversation, ArcProject } from "@/lib/arc-chat/persistence";

import { createProjectForm, unarchiveThreadForm } from "../actions";
import { relativeTime } from "./relative-time";
import { ThreadContextMenu, ThreadMenu } from "./thread-menu";
import { SLASH_COMMANDS } from "./slash-commands";

/** Discoverable agent capabilities — one click opens a fresh chat primed with
 *  the command (the deep link the composer reads via ?skill=<id>). Reuses the
 *  same command definitions as the composer's "/" menu. */
function SkillsSection() {
  return (
    <div className="flex flex-col gap-0.5">
      <SectionLabel>Skills</SectionLabel>
      {SLASH_COMMANDS.map((c) => (
        <Link
          key={c.cmd}
          href={`/arc?skill=${c.cmd.slice(1)}`}
          title={c.hint}
          className="group flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm text-[var(--text-secondary)] transition hover:bg-[var(--surface-inset)] hover:text-[var(--text-primary)]"
        >
          <svg viewBox="0 0 20 20" aria-hidden className="h-3.5 w-3.5 shrink-0 text-[var(--accent)]" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10 2.5c.4 3.2 1.4 4.2 4.6 4.6-3.2.4-4.2 1.4-4.6 4.6-.4-3.2-1.4-4.2-4.6-4.6 3.2-.4 4.2-1.4 4.6-4.6Z" />
          </svg>
          <span className="min-w-0 flex-1 truncate">{c.label}</span>
        </Link>
      ))}
    </div>
  );
}

/** Stable empty set so the default props don't allocate per render. */
const NO_RUNNING_IDS: Set<string> = new Set();

/** Per-thread run indicator: spinner while Arc is working, a pulse when a reply
 *  has landed but the thread hasn't been opened yet (Codex-style). */
type RunState = "working" | "done" | "idle";

/** Spinning ring shown while Arc is actively working a thread. */
function WorkingSpinner() {
  return (
    <span className="flex shrink-0" aria-label="Arc is working" title="Arc is working…">
      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-[var(--accent)] motion-safe:animate-spin" fill="none" aria-hidden>
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity="0.25" />
        <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      </svg>
    </span>
  );
}

/** Gold pulse marking a finished reply you haven't opened yet. Clears on open. */
function DonePulse() {
  return (
    <span className="relative flex h-2 w-2 shrink-0" aria-label="New reply from Arc" title="New reply — open to view">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--accent)] opacity-60" />
      <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--accent)]" />
    </span>
  );
}

function SectionLabel({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 px-2 pt-3.5">
      <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
        <span aria-hidden className="h-2.5 w-px rounded-full bg-[var(--accent)]" />
        {children}
      </p>
      {action}
    </div>
  );
}

/** Lighter sub-label for the date buckets inside the Chats history. */
function DateLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-2 pb-0.5 pt-2.5 text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--text-muted)]/80">
      {children}
    </p>
  );
}

/** Bucket a conversation's last-activity time into a human history group. */
function dateBucket(iso: string, nowMs: number): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "Older";
  const start = new Date(nowMs);
  start.setHours(0, 0, 0, 0);
  const t0 = start.getTime();
  const day = 86_400_000;
  if (t >= t0) return "Today";
  if (t >= t0 - day) return "Yesterday";
  if (t >= t0 - 7 * day) return "Previous 7 days";
  if (t >= t0 - 30 * day) return "Previous 30 days";
  return "Older";
}

const BUCKET_ORDER = ["Today", "Yesterday", "Previous 7 days", "Previous 30 days", "Older"] as const;

function groupByDate(rows: ArcConversation[], nowMs: number): { label: string; rows: ArcConversation[] }[] {
  const map = new Map<string, ArcConversation[]>();
  for (const c of rows) {
    const k = dateBucket(c.lastMessageAt, nowMs);
    const list = map.get(k) ?? [];
    list.push(c);
    map.set(k, list);
  }
  return BUCKET_ORDER.filter((k) => map.has(k)).map((label) => ({ label, rows: map.get(label)! }));
}

function NewChatLink({ assistantName }: { assistantName: string }) {
  return (
    <Link
      href="/arc"
      aria-label={`Start a new chat with ${assistantName}`}
      className="group flex items-center gap-2 rounded-lg border border-[var(--accent-border-strong)] bg-[var(--accent-soft)] px-3 py-2.5 text-sm font-semibold text-[var(--text-primary)] transition hover:bg-[var(--surface-raised)] active:translate-y-px"
    >
      <span className="flex h-5 w-5 items-center justify-center rounded-md bg-[var(--accent)] text-[var(--on-accent)] transition group-hover:scale-105">
        <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
          <path d="M10 4v12M4 10h12" />
        </svg>
      </span>
      New chat
    </Link>
  );
}

function PinGlyph() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden className="h-3 w-3 shrink-0 text-[var(--accent)]" fill="currentColor">
      <path d="M12 2l1 5 3 2-4 1-1 6-1-6-4-1 3-2 1-5z" />
    </svg>
  );
}

function ChatRow({
  c,
  projects,
  activeId,
  nowMs,
  state = "idle",
}: {
  c: ArcConversation;
  projects: ArcProject[];
  activeId: string;
  nowMs: number;
  state?: RunState;
}) {
  const active = c.id === activeId;
  const titleText =
    state === "working" ? `${c.title} — Arc is working…` : state === "done" ? `${c.title} — new reply` : c.title;
  return (
    <ThreadContextMenu
      className="group relative flex items-center gap-1"
      conversationId={c.id}
      projectId={c.projectId}
      pinned={Boolean(c.pinnedAt)}
      projects={projects}
      title={c.title}
      isActive={active}
    >
      <Link
        href={`/arc?c=${c.id}`}
        aria-current={active ? "page" : undefined}
        className={cx(
          "flex min-w-0 flex-1 items-center gap-2 rounded-lg px-3 py-2 text-sm transition",
          active
            ? "bg-[var(--accent-soft)] font-medium text-[var(--text-primary)] shadow-[inset_0_0_0_1px_var(--accent-border-strong)]"
            : "text-[var(--text-secondary)] hover:bg-[var(--surface-inset)] hover:text-[var(--text-primary)]",
        )}
        title={titleText}
      >
        {c.pinnedAt ? <PinGlyph /> : null}
        <span className={cx("min-w-0 flex-1 truncate", state === "done" ? "font-semibold text-[var(--text-primary)]" : "")}>{c.title}</span>
        {state === "working" ? (
          <WorkingSpinner />
        ) : state === "done" ? (
          <DonePulse />
        ) : (
          <span className="shrink-0 text-[10px] tabular-nums text-[var(--text-muted)] transition-opacity duration-150 group-hover:opacity-0">
            {relativeTime(c.lastMessageAt, nowMs)}
          </span>
        )}
      </Link>
      <div className="absolute right-1 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
        <ThreadMenu
          conversationId={c.id}
          projectId={c.projectId}
          pinned={Boolean(c.pinnedAt)}
          projects={projects}
          title={c.title}
          isActive={active}
        />
      </div>
    </ThreadContextMenu>
  );
}

function ProjectGroup({
  project,
  rows,
  projects,
  activeId,
  nowMs,
  runningIds = NO_RUNNING_IDS,
  doneIds = NO_RUNNING_IDS,
}: {
  project: ArcProject;
  rows: ArcConversation[];
  projects: ArcProject[];
  activeId: string;
  nowMs: number;
  runningIds?: Set<string>;
  doneIds?: Set<string>;
}) {
  // Groups holding the active thread start open; everything else starts open
  // too — collapse is a per-session reading aid, not persisted state.
  const [open, setOpen] = useState(true);
  const containsActive = rows.some((c) => c.id === activeId);

  return (
    <div className="flex flex-col">
      <div className="group/proj flex items-center rounded-md pr-1 transition hover:bg-[var(--surface-inset)]">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-2 py-1.5 text-left"
        >
          <svg
            viewBox="0 0 20 20"
            aria-hidden
            className={cx("h-3 w-3 shrink-0 text-[var(--text-muted)] transition-transform", open ? "rotate-90" : "")}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m8 5 5 5-5 5" />
          </svg>
          <svg
            viewBox="0 0 20 20"
            aria-hidden
            className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M2.5 5.5A1.5 1.5 0 0 1 4 4h4l2 2.5h6a1.5 1.5 0 0 1 1.5 1.5v6.5a1.5 1.5 0 0 1-1.5 1.5H4a1.5 1.5 0 0 1-1.5-1.5z" />
          </svg>
          <span
            className={cx(
              "min-w-0 flex-1 truncate text-xs font-medium",
              containsActive && !open ? "text-[var(--text-primary)]" : "text-[var(--text-secondary)]",
            )}
          >
            {project.name}
          </span>
        </button>
        {/* New chat in this project — hover-revealed, swaps with the count like ChatRow. */}
        <Link
          href={`/arc?project=${project.id}`}
          title={`New chat in ${project.name}`}
          aria-label={`New chat in ${project.name}`}
          className="hidden h-5 w-5 shrink-0 items-center justify-center rounded text-[var(--text-muted)] transition hover:bg-[var(--surface-raised)] hover:text-[var(--text-primary)] group-hover/proj:flex focus-visible:flex"
        >
          <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M10 4v12M4 10h12" />
          </svg>
        </Link>
        <span className="shrink-0 px-1 text-[10px] tabular-nums text-[var(--text-muted)] group-hover/proj:hidden">
          {rows.length}
        </span>
      </div>
      {open ? (
        <div className="ml-[13px] flex flex-col gap-0.5 border-l border-[var(--border-hairline)] pl-1.5">
          {rows.length === 0 ? (
            <p className="px-2 py-1 text-xs text-[var(--text-muted)]">No chats yet.</p>
          ) : (
            rows.map((c) => (
              <ChatRow key={c.id} c={c} projects={projects} activeId={activeId} nowMs={nowMs} state={runningIds.has(c.id) ? "working" : doneIds.has(c.id) ? "done" : "idle"} />
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}

function NewProjectForm({ onDone }: { onDone: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    inputRef.current?.focus();
  }, []);
  return (
    <form action={createProjectForm} className="flex items-center gap-1 px-1 pt-1">
      <input
        ref={inputRef}
        name="name"
        placeholder="Project name"
        aria-label="New project name"
        onKeyDown={(e) => {
          if (e.key === "Escape") onDone();
        }}
        className="h-8 min-w-0 flex-1 rounded-md border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-2.5 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
      />
      <button
        type="submit"
        className="h-8 shrink-0 rounded-md border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-2.5 text-xs font-medium text-[var(--text-secondary)] transition hover:border-[var(--accent-border-strong)] hover:text-[var(--text-primary)]"
      >
        Create
      </button>
    </form>
  );
}

export function ThreadSidebar({
  conversations,
  projects,
  archived,
  showArchived,
  activeId,
  variant = "rail",
  assistantName = "Arc",
  runningIds = NO_RUNNING_IDS,
  doneIds = NO_RUNNING_IDS,
  collapsed = false,
  onToggleCollapse,
}: {
  conversations: ArcConversation[];
  projects: ArcProject[];
  archived: ArcConversation[];
  showArchived: boolean;
  activeId: string;
  variant?: "rail" | "overlay";
  assistantName?: string;
  /** Conversation ids with an Arc run in flight — drives the working spinner. */
  runningIds?: Set<string>;
  /** Conversation ids with a finished-but-unopened reply — drives the pulse. */
  doneIds?: Set<string>;
  /** Collapsed icon-rail mode (desktop only). */
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}) {
  const [query, setQuery] = useState("");
  const [creatingProject, setCreatingProject] = useState(false);
  const asideClass = cx(
    variant === "overlay" ? "flex" : "hidden lg:flex",
    "min-h-0 flex-col gap-1 overflow-y-auto p-3",
  );
  // Stable "now" for the render pass, refreshed periodically so relative
  // timestamps don't go stale. Lazy init keeps Date.now() out of render.
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  // Collapsed icon rail (desktop): just the essentials; expand to see threads.
  if (collapsed && variant !== "overlay") {
    const railBtn =
      "flex h-9 w-9 items-center justify-center rounded-lg text-[var(--text-muted)] transition hover:bg-[var(--surface-inset)] hover:text-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]";
    return (
      <aside className="hidden min-h-0 flex-col items-center gap-2 overflow-y-auto p-2 lg:flex">
        <button type="button" onClick={onToggleCollapse} title="Expand sidebar" aria-label="Expand sidebar" className={railBtn}>
          <svg viewBox="0 0 20 20" className="h-4.5 w-4.5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="14" height="12" rx="2" />
            <path d="M8 4v12" />
          </svg>
        </button>
        <Link
          href="/arc"
          title="New chat"
          aria-label="New chat"
          className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--accent)] text-[var(--on-accent)] transition hover:bg-[var(--accent-strong)]"
        >
          <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
            <path d="M10 4v12M4 10h12" />
          </svg>
        </Link>
        <button type="button" onClick={onToggleCollapse} title="Search chats" aria-label="Search chats" className={railBtn}>
          <svg viewBox="0 0 20 20" className="h-4.5 w-4.5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="9" cy="9" r="5.5" />
            <path d="m13.5 13.5 3 3" />
          </svg>
        </button>
        <Link
          href="/settings"
          title={`${assistantName} — settings`}
          aria-label={`${assistantName} settings`}
          className="mt-auto flex h-8 w-8 items-center justify-center rounded-md bg-[var(--accent-soft)] text-xs font-semibold text-[var(--accent-contrast)] shadow-[inset_0_0_0_1px_var(--accent-border-strong)]"
        >
          {(assistantName.trim()[0] ?? "A").toUpperCase()}
        </Link>
      </aside>
    );
  }

  if (showArchived) {
    return (
      <aside className={asideClass}>
        <NewChatLink assistantName={assistantName} />
        <Link
          href="/arc"
          className="mt-1 flex items-center gap-1 px-2 py-1 text-xs font-medium text-[var(--text-muted)] transition hover:text-[var(--text-primary)]"
        >
          <svg viewBox="0 0 20 20" aria-hidden className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m12 5-5 5 5 5" />
          </svg>
          Back to chats
        </Link>
        <SectionLabel>Archived</SectionLabel>
        <nav aria-label="Archived conversations" className="flex min-h-0 flex-col gap-0.5">
          {archived.length === 0 ? (
            <p className="px-2 py-3 text-xs text-[var(--text-muted)]">No archived chats.</p>
          ) : (
            archived.map((c) => (
              <div key={c.id} className="group flex items-center gap-1">
                <Link
                  href={`/arc?c=${c.id}`}
                  className="min-w-0 flex-1 truncate rounded-lg px-3 py-2 text-sm text-[var(--text-secondary)] transition hover:bg-[var(--surface-inset)] hover:text-[var(--text-primary)]"
                  title={c.title}
                >
                  {c.title}
                </Link>
                <form action={unarchiveThreadForm} className="shrink-0 pr-1 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
                  <input type="hidden" name="conversationId" value={c.id} />
                  <button
                    type="submit"
                    title="Restore chat"
                    className="rounded-md px-2 py-1 text-xs font-medium text-[var(--accent-contrast)] transition hover:bg-[var(--surface-inset)]"
                  >
                    Restore
                  </button>
                </form>
              </div>
            ))
          )}
        </nav>
      </aside>
    );
  }

  const q = query.trim().toLowerCase();
  const filtered = q ? conversations.filter((c) => c.title.toLowerCase().includes(q)) : conversations;

  const pinned = filtered.filter((c) => c.pinnedAt);
  const unpinned = filtered.filter((c) => !c.pinnedAt);
  const unprojected = unpinned.filter((c) => !c.projectId);
  const byProject = new Map<string, ArcConversation[]>();
  for (const c of unpinned) {
    if (!c.projectId) continue;
    const list = byProject.get(c.projectId) ?? [];
    list.push(c);
    byProject.set(c.projectId, list);
  }

  return (
    <aside className={asideClass}>
      {onToggleCollapse ? (
        <div className="flex justify-end px-1">
          <button
            type="button"
            onClick={onToggleCollapse}
            title="Collapse sidebar"
            aria-label="Collapse sidebar"
            className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--text-muted)] transition hover:bg-[var(--surface-inset)] hover:text-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
          >
            <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="14" height="12" rx="2" />
              <path d="M8 4v12" />
            </svg>
          </button>
        </div>
      ) : null}
      <NewChatLink assistantName={assistantName} />

      <label className="relative mt-1 block px-1">
        <span className="sr-only">Search chats</span>
        <svg
          aria-hidden
          className="pointer-events-none absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-muted)]"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          viewBox="0 0 20 20"
        >
          <circle cx="9" cy="9" r="6" />
          <path d="m18 18-4.5-4.5" strokeLinecap="round" />
        </svg>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search chats"
          aria-label="Search chats"
          className="h-8 w-full rounded-md border border-[var(--border-hairline)] bg-[var(--surface-inset)] pl-8 pr-12 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
        />
        <kbd
          aria-hidden
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded border border-[var(--border-hairline)] bg-[var(--surface-soft)] px-1 py-px font-mono text-[9px] text-[var(--text-muted)]"
        >
          Ctrl K
        </kbd>
      </label>

      <SkillsSection />

      {pinned.length > 0 ? (
        <div className="flex flex-col gap-0.5">
          <SectionLabel>Pinned</SectionLabel>
          {pinned.map((c) => (
            <ChatRow key={c.id} c={c} projects={projects} activeId={activeId} nowMs={nowMs} state={runningIds.has(c.id) ? "working" : doneIds.has(c.id) ? "done" : "idle"} />
          ))}
        </div>
      ) : null}

      <SectionLabel
        action={
          <button
            type="button"
            onClick={() => setCreatingProject((v) => !v)}
            aria-label={creatingProject ? "Cancel new project" : "New project"}
            title={creatingProject ? "Cancel" : "New project"}
            className="flex h-5 w-5 items-center justify-center rounded text-[var(--text-muted)] transition hover:bg-[var(--surface-inset)] hover:text-[var(--text-primary)]"
          >
            <svg viewBox="0 0 20 20" className={cx("h-3.5 w-3.5 transition", creatingProject ? "rotate-45" : "")} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M10 4v12M4 10h12" />
            </svg>
          </button>
        }
      >
        Projects
      </SectionLabel>
      {creatingProject ? <NewProjectForm onDone={() => setCreatingProject(false)} /> : null}
      {projects.length === 0 && !creatingProject ? (
        <p className="px-3 py-1 text-xs text-[var(--text-muted)]">Group related chats into a project.</p>
      ) : null}

      {projects.map((project) => (
        <ProjectGroup
          key={project.id}
          project={project}
          rows={byProject.get(project.id) ?? []}
          projects={projects}
          activeId={activeId}
          nowMs={nowMs}
          runningIds={runningIds}
          doneIds={doneIds}
        />
      ))}

      <SectionLabel>Chats</SectionLabel>
      <nav aria-label="Conversations" className="flex min-h-0 flex-col">
        {unprojected.length === 0 ? (
          <p className="px-2 py-3 text-xs text-[var(--text-muted)]">
            {q ? "No matches." : `No conversations yet. Say hello to ${assistantName}.`}
          </p>
        ) : (
          groupByDate(unprojected, nowMs).map((bucket) => (
            <div key={bucket.label} className="flex flex-col gap-0.5">
              <DateLabel>{bucket.label}</DateLabel>
              {bucket.rows.map((c) => (
                <ChatRow key={c.id} c={c} projects={projects} activeId={activeId} nowMs={nowMs} state={runningIds.has(c.id) ? "working" : doneIds.has(c.id) ? "done" : "idle"} />
              ))}
            </div>
          ))
        )}
      </nav>

      <div className="mt-auto flex flex-col gap-1 border-t border-[var(--border-hairline)] pt-2">
        <div className="flex items-center justify-between gap-2 px-2">
          <Link
            href="/arc/saved"
            className="flex items-center gap-1.5 py-1 text-xs font-medium text-[var(--text-muted)] transition hover:text-[var(--text-primary)]"
          >
            <svg viewBox="0 0 20 20" aria-hidden className="h-3.5 w-3.5 text-[var(--accent)]" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 2.5l2.2 4.6 5 .7-3.6 3.5.9 5L10 14l-4.5 2.4.9-5L2.8 7.8l5-.7z" />
            </svg>
            Saved
          </Link>
          <Link
            href="/arc?archived=1"
            className="flex items-center gap-1 py-1 text-xs font-medium text-[var(--text-muted)] transition hover:text-[var(--text-primary)]"
          >
            Archived
            <svg viewBox="0 0 20 20" aria-hidden className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m8 5 5 5-5 5" />
            </svg>
          </Link>
        </div>

        {/* Account / agent row — identity + settings, like the account menu in
            ChatGPT/Claude. Opens the full settings page. */}
        <Link
          href="/settings"
          title={`${assistantName} — agent & workspace settings`}
          className="group flex items-center gap-2.5 rounded-lg px-2 py-2 transition hover:bg-[var(--surface-inset)]"
        >
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[var(--accent-soft)] text-xs font-semibold text-[var(--accent-contrast)] shadow-[inset_0_0_0_1px_var(--accent-border-strong)]">
            {(assistantName.trim()[0] ?? "A").toUpperCase()}
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-sm font-medium text-[var(--text-primary)]">{assistantName}</span>
            <span className="truncate text-[11px] text-[var(--text-muted)]">Settings &amp; connection</span>
          </span>
          <svg viewBox="0 0 24 24" aria-hidden className="h-4 w-4 shrink-0 text-[var(--text-muted)] transition group-hover:text-[var(--text-primary)]" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 13a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 8 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H2a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 3.6 8a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H8a1.65 1.65 0 0 0 1-1.51V2a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V8a1.65 1.65 0 0 0 1.51 1H22a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
          </svg>
        </Link>
      </div>
    </aside>
  );
}
