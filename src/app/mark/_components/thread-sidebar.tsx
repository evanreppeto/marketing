"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

import { cx } from "@/app/_components/theme";
import type { MarkConversation, MarkProject } from "@/lib/mark-chat/persistence";

import { createProjectForm, unarchiveThreadForm } from "../actions";
import { relativeTime } from "./relative-time";
import { ThreadMenu } from "./thread-menu";

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

function groupByDate(rows: MarkConversation[], nowMs: number): { label: string; rows: MarkConversation[] }[] {
  const map = new Map<string, MarkConversation[]>();
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
      href="/mark"
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
}: {
  c: MarkConversation;
  projects: MarkProject[];
  activeId: string;
  nowMs: number;
}) {
  const active = c.id === activeId;
  return (
    <div className="group relative flex items-center gap-1">
      <Link
        href={`/mark?c=${c.id}`}
        aria-current={active ? "page" : undefined}
        className={cx(
          "flex min-w-0 flex-1 items-center gap-2 rounded-lg px-3 py-2 text-sm transition",
          active
            ? "bg-[var(--accent-soft)] font-medium text-[var(--text-primary)] shadow-[inset_0_0_0_1px_var(--accent-border-strong)]"
            : "text-[var(--text-secondary)] hover:bg-[var(--surface-inset)] hover:text-[var(--text-primary)]",
        )}
        title={c.title}
      >
        {c.pinnedAt ? <PinGlyph /> : null}
        <span className="min-w-0 flex-1 truncate">{c.title}</span>
        <span className="shrink-0 text-[10px] tabular-nums text-[var(--text-muted)] group-hover:hidden">
          {relativeTime(c.lastMessageAt, nowMs)}
        </span>
      </Link>
      <div className="absolute right-1 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
        <ThreadMenu
          conversationId={c.id}
          projectId={c.projectId}
          pinned={Boolean(c.pinnedAt)}
          projects={projects}
          isActive={active}
        />
      </div>
    </div>
  );
}

function ProjectGroup({
  project,
  rows,
  projects,
  activeId,
  nowMs,
}: {
  project: MarkProject;
  rows: MarkConversation[];
  projects: MarkProject[];
  activeId: string;
  nowMs: number;
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
          href={`/mark?project=${project.id}`}
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
              <ChatRow key={c.id} c={c} projects={projects} activeId={activeId} nowMs={nowMs} />
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
  assistantName = "Agent",
}: {
  conversations: MarkConversation[];
  projects: MarkProject[];
  archived: MarkConversation[];
  showArchived: boolean;
  activeId: string;
  variant?: "rail" | "overlay";
  assistantName?: string;
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

  if (showArchived) {
    return (
      <aside className={asideClass}>
        <NewChatLink assistantName={assistantName} />
        <Link
          href="/mark"
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
                  href={`/mark?c=${c.id}`}
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
  const byProject = new Map<string, MarkConversation[]>();
  for (const c of unpinned) {
    if (!c.projectId) continue;
    const list = byProject.get(c.projectId) ?? [];
    list.push(c);
    byProject.set(c.projectId, list);
  }

  return (
    <aside className={asideClass}>
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

      {pinned.length > 0 ? (
        <div className="flex flex-col gap-0.5">
          <SectionLabel>Pinned</SectionLabel>
          {pinned.map((c) => (
            <ChatRow key={c.id} c={c} projects={projects} activeId={activeId} nowMs={nowMs} />
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
                <ChatRow key={c.id} c={c} projects={projects} activeId={activeId} nowMs={nowMs} />
              ))}
            </div>
          ))
        )}
      </nav>

      <div className="mt-auto flex items-center justify-between gap-2 pt-3">
        <Link
          href="/mark/saved"
          className="flex items-center gap-1.5 px-2 pb-1 text-xs font-medium text-[var(--text-muted)] transition hover:text-[var(--text-primary)]"
        >
          <svg viewBox="0 0 20 20" aria-hidden className="h-3.5 w-3.5 text-[var(--accent)]" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10 2.5l2.2 4.6 5 .7-3.6 3.5.9 5L10 14l-4.5 2.4.9-5L2.8 7.8l5-.7z" />
          </svg>
          Saved
        </Link>
        <Link
          href="/mark?archived=1"
          className="flex items-center gap-1 px-2 pb-1 text-xs font-medium text-[var(--text-muted)] transition hover:text-[var(--text-primary)]"
        >
          Archived
          <svg viewBox="0 0 20 20" aria-hidden className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m8 5 5 5-5 5" />
          </svg>
        </Link>
      </div>
    </aside>
  );
}
