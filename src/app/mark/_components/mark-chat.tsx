"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import type { MarkConversation, MarkMessage } from "@/lib/mark-chat/persistence";
import type { MentionGroup } from "@/lib/mark-chat/mention-search";

import { Composer } from "./composer";
import { MessageList } from "./message-list";
import { ThreadSidebar } from "./thread-sidebar";
import { getThreadMessagesAction } from "../actions";

export function MarkChat({
  conversations,
  activeId,
  activeTitle,
  initialMessages,
  mentionGroups,
}: {
  conversations: MarkConversation[];
  activeId: string;
  activeTitle: string;
  initialMessages: MarkMessage[];
  mentionGroups: MentionGroup[];
}) {
  const router = useRouter();
  const [messages, setMessages] = useState<MarkMessage[]>(initialMessages);

  // Re-seed when the server sends a different thread (navigation).
  useEffect(() => {
    // Schedule asynchronously to satisfy the set-state-in-effect lint rule.
    void Promise.resolve().then(() => setMessages(initialMessages));
  }, [activeId, initialMessages]);

  const awaitingReply = messages.some((m) => m.role === "mark" && m.status === "pending");

  // Poll the active thread while a Mark reply is pending.
  const activeIdRef = useRef(activeId);
  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);
  useEffect(() => {
    if (!activeId || !awaitingReply) return;
    let cancelled = false;
    const timer = setInterval(async () => {
      const fresh = await getThreadMessagesAction(activeIdRef.current);
      if (cancelled || activeIdRef.current !== activeId) return;
      if (fresh.length > 0) setMessages(fresh);
    }, 2500);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [activeId, awaitingReply]);

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
        <ThreadSidebar conversations={conversations} activeId={activeId} />
        <section className="flex min-h-0 flex-col border-t border-[var(--border-hairline)] lg:border-l lg:border-t-0">
          <MessageList messages={messages} />
          <Composer
            conversationId={activeId}
            mentionGroups={mentionGroups}
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
