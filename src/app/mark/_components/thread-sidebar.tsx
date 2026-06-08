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
    <aside className="flex min-h-0 flex-col gap-3 lg:w-72 lg:shrink-0">
      <Link
        href="/mark"
        aria-label="Start a new chat with Mark"
        className="flex items-center justify-center gap-2 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-3 py-2.5 text-sm font-bold text-[var(--text-primary)] transition hover:border-[var(--accent)] hover:bg-[var(--surface-raised)]"
      >
        + New chat
      </Link>
      <nav aria-label="Conversations" className="flex min-h-0 flex-col gap-1 overflow-y-auto">
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
                  "truncate rounded-lg border px-3 py-2 text-sm transition",
                  active
                    ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text-primary)] shadow-[var(--accent-shadow)]"
                    : "border-transparent text-[var(--text-secondary)] hover:border-[var(--border-hairline)] hover:bg-[var(--surface-inset)] hover:text-[var(--text-primary)]",
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
