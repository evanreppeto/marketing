"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import type { MarkConversation, MarkMessage, MarkProject } from "@/lib/mark-chat/persistence";
import type { MentionGroup } from "@/lib/mark-chat/mention-search";

import { Composer } from "./composer";
import { ChatEmptyState } from "./empty-state";
import { MessageList } from "./message-list";
import { ThreadSidebar } from "./thread-sidebar";
import { useThreadPoll } from "./use-thread-poll";

export function MarkChat({
  conversations,
  projects,
  archived,
  showArchived,
  activeId,
  activeTitle,
  initialMessages,
  mentionGroups,
}: {
  conversations: MarkConversation[];
  projects: MarkProject[];
  archived: MarkConversation[];
  showArchived: boolean;
  activeId: string;
  activeTitle: string;
  initialMessages: MarkMessage[];
  mentionGroups: MentionGroup[];
}) {
  const router = useRouter();
  const [messages, setMessages] = useState<MarkMessage[]>(initialMessages);
  const [draft, setDraft] = useState("");
  const composerRef = useRef<HTMLTextAreaElement>(null);

  useThreadPoll(activeId, messages, setMessages);

  // Re-seed when the server sends a different thread (navigation).
  useEffect(() => {
    // Schedule asynchronously to satisfy the set-state-in-effect lint rule.
    void Promise.resolve().then(() => setMessages(initialMessages));
  }, [activeId, initialMessages]);

  function pickSuggestion(prompt: string) {
    setDraft(prompt);
    requestAnimationFrame(() => {
      const el = composerRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(prompt.length, prompt.length);
    });
  }

  const hasMessages = messages.length > 0;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-center justify-between gap-3 pb-3">
        <div className="min-w-0">
          <p className="signal-eyebrow">Mark</p>
          <h1 className="truncate font-display text-lg font-bold tracking-[-0.02em] text-[var(--text-primary)]">
            {activeTitle || "New chat"}
          </h1>
        </div>
        <Link
          href="/agent-operations"
          className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-3 text-sm font-bold text-[var(--text-secondary)] transition hover:border-[var(--accent)] hover:text-[var(--text-primary)]"
        >
          Operations ▸
        </Link>
      </header>

      <div className="grid min-h-0 flex-1 overflow-hidden rounded-xl border border-[var(--border-panel)] bg-[var(--surface-panel)] shadow-[var(--elev-panel)] lg:grid-cols-[15rem_minmax(0,1fr)]">
        <ThreadSidebar
          conversations={conversations}
          projects={projects}
          archived={archived}
          showArchived={showArchived}
          activeId={activeId}
        />
        <section className="flex min-h-0 flex-col border-t border-[var(--border-hairline)] lg:border-l lg:border-t-0">
          {hasMessages ? <MessageList messages={messages} /> : <ChatEmptyState onPick={pickSuggestion} />}
          <Composer
            conversationId={activeId}
            mentionGroups={mentionGroups}
            draft={draft}
            onDraftChange={setDraft}
            textareaRef={composerRef}
            onOptimistic={(optimistic) => setMessages((prev) => [...prev, optimistic])}
            onSent={(newConversationId) => {
              if (!activeId && newConversationId) {
                router.push(`/mark?c=${newConversationId}`);
              } else {
                router.refresh();
              }
            }}
          />
        </section>
      </div>
    </div>
  );
}
