"use client";

import Link from "next/link";

import { cx } from "@/app/_components/theme";
import type { MarkConversation } from "@/lib/mark-chat/persistence";

export function ThreadSidebar({
  conversations,
  activeId,
}: {
  conversations: MarkConversation[];
  activeId: string;
}) {
  return (
    <aside className="hidden min-h-0 flex-col gap-2 overflow-y-auto p-3 lg:flex">
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
      <p className="signal-eyebrow px-2 pt-2">Chats</p>
      <nav aria-label="Conversations" className="flex min-h-0 flex-col gap-0.5">
        {conversations.length === 0 ? (
          <p className="px-2 py-3 text-xs text-[var(--text-muted)]">No conversations yet. Say hello to Mark.</p>
        ) : (
          conversations.map((c) => {
            const active = c.id === activeId;
            return (
              <Link
                key={c.id}
                href={`/mark?c=${c.id}`}
                aria-current={active ? "page" : undefined}
                className={cx(
                  "truncate rounded-lg px-3 py-2 text-sm transition",
                  active
                    ? "bg-[var(--surface-raised)] font-semibold text-[var(--text-primary)]"
                    : "text-[var(--text-secondary)] hover:bg-[var(--surface-inset)] hover:text-[var(--text-primary)]",
                )}
                title={c.title}
              >
                {c.title}
              </Link>
            );
          })
        )}
      </nav>
    </aside>
  );
}
