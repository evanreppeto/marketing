"use client";

import Link from "next/link";

import { cx } from "@/app/_components/theme";
import type { MarkConversation, MarkProject } from "@/lib/mark-chat/persistence";

import { archiveThreadForm, createProjectForm, moveConversationForm, unarchiveThreadForm } from "../actions";

function NewChatLink() {
  return (
    <Link
      href="/mark"
      aria-label="Start a new chat with Mark"
      className="flex items-center gap-2 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-3 py-2.5 text-sm font-bold text-[var(--text-primary)] transition hover:border-[var(--accent)] hover:bg-[var(--surface-raised)]"
    >
      <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M10 4v12M4 10h12" />
      </svg>
      New chat
    </Link>
  );
}

function ChatRow({ c, projects, activeId }: { c: MarkConversation; projects: MarkProject[]; activeId: string }) {
  const active = c.id === activeId;
  return (
    <div className="group relative flex items-center gap-1">
      <Link
        href={`/mark?c=${c.id}`}
        aria-current={active ? "page" : undefined}
        className={cx(
          "min-w-0 flex-1 truncate rounded-lg px-3 py-2 text-sm transition",
          active
            ? "bg-[var(--surface-raised)] font-semibold text-[var(--text-primary)]"
            : "text-[var(--text-secondary)] hover:bg-[var(--surface-inset)] hover:text-[var(--text-primary)]",
        )}
        title={c.title}
      >
        {c.title}
      </Link>
      <div className="flex shrink-0 items-center gap-0.5 pr-1 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
        <form action={moveConversationForm} title="Move to project">
          <input type="hidden" name="conversationId" value={c.id} />
          <select
            name="projectId"
            defaultValue={c.projectId ?? ""}
            aria-label="Move chat to project"
            onChange={(e) => e.currentTarget.form?.requestSubmit()}
            className="max-w-[6rem] rounded-md border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-1 py-0.5 text-xs text-[var(--text-secondary)]"
          >
            <option value="">No project</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </form>
        <form action={archiveThreadForm}>
          <input type="hidden" name="conversationId" value={c.id} />
          <button
            type="submit"
            title="Archive chat"
            aria-label="Archive chat"
            className="rounded-md p-1 text-[var(--text-muted)] transition hover:bg-[var(--surface-inset)] hover:text-[var(--text-primary)]"
          >
            <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 5h14M4 5l1 11h10l1-11M8 9h4" />
            </svg>
          </button>
        </form>
      </div>
    </div>
  );
}

export function ThreadSidebar({
  conversations,
  projects,
  archived,
  showArchived,
  activeId,
}: {
  conversations: MarkConversation[];
  projects: MarkProject[];
  archived: MarkConversation[];
  showArchived: boolean;
  activeId: string;
}) {
  if (showArchived) {
    return (
      <aside className="hidden min-h-0 flex-col gap-2 overflow-y-auto p-3 lg:flex">
        <NewChatLink />
        <Link href="/mark" className="signal-eyebrow px-2 pt-2 hover:text-[var(--text-primary)]">
          ‹ Back to chats
        </Link>
        <p className="signal-eyebrow px-2 pt-1">Archived</p>
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
                    className="rounded-md px-2 py-1 text-xs font-semibold text-[var(--accent-contrast)] transition hover:bg-[var(--surface-inset)]"
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

  const unprojected = conversations.filter((c) => !c.projectId);
  const byProject = new Map<string, MarkConversation[]>();
  for (const c of conversations) {
    if (!c.projectId) continue;
    const list = byProject.get(c.projectId) ?? [];
    list.push(c);
    byProject.set(c.projectId, list);
  }

  return (
    <aside className="hidden min-h-0 flex-col gap-2 overflow-y-auto p-3 lg:flex">
      <NewChatLink />

      <form action={createProjectForm} className="flex items-center gap-1 px-1 pt-1">
        <input
          name="name"
          placeholder="New project"
          aria-label="New project name"
          className="min-w-0 flex-1 rounded-md border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-2 py-1 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
        />
        <button
          type="submit"
          aria-label="Create project"
          className="rounded-md border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-2 py-1 text-xs font-bold text-[var(--text-secondary)] transition hover:border-[var(--accent)] hover:text-[var(--text-primary)]"
        >
          +
        </button>
      </form>

      {projects.map((project) => (
        <div key={project.id} className="flex flex-col gap-0.5">
          <p className="signal-eyebrow px-2 pt-2">{project.name}</p>
          {(byProject.get(project.id) ?? []).length === 0 ? (
            <p className="px-3 py-1 text-xs text-[var(--text-muted)]">No chats yet.</p>
          ) : (
            (byProject.get(project.id) ?? []).map((c) => (
              <ChatRow key={c.id} c={c} projects={projects} activeId={activeId} />
            ))
          )}
        </div>
      ))}

      <p className="signal-eyebrow px-2 pt-2">Chats</p>
      <nav aria-label="Conversations" className="flex min-h-0 flex-col gap-0.5">
        {unprojected.length === 0 ? (
          <p className="px-2 py-3 text-xs text-[var(--text-muted)]">No conversations yet. Say hello to Mark.</p>
        ) : (
          unprojected.map((c) => <ChatRow key={c.id} c={c} projects={projects} activeId={activeId} />)
        )}
      </nav>

      <Link
        href="/mark?archived=1"
        className="mt-1 px-2 py-2 text-xs font-semibold text-[var(--text-muted)] transition hover:text-[var(--text-primary)]"
      >
        Archived ›
      </Link>
    </aside>
  );
}
