"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import type { MarkConversation, MarkMessage, MarkProject } from "@/lib/mark-chat/persistence";
import type { MentionGroup } from "@/lib/mark-chat/mention-search";

import { cancelReplyAction, regenerateMarkReplyAction, renameThreadAction, type SimpleActionState } from "../actions";
import { Composer } from "./composer";
import { ChatEmptyState } from "./empty-state";
import { MessageList } from "./message-list";
import { ThreadMenu } from "./thread-menu";
import { ThreadSidebar } from "./thread-sidebar";
import { useThreadPoll } from "./use-thread-poll";

function HeaderTitle({
  activeId,
  activeTitle,
}: {
  activeId: string;
  activeTitle: string;
}) {
  const [editing, setEditing] = useState(false);
  const [state, formAction] = useActionState<SimpleActionState, FormData>(renameThreadAction, null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  // Close the editor once a rename succeeds.
  const lastOk = useRef(false);
  useEffect(() => {
    if (state?.ok && !lastOk.current) {
      lastOk.current = true;
      void Promise.resolve().then(() => setEditing(false));
    }
    if (!state?.ok) lastOk.current = false;
  }, [state]);

  if (!activeId) {
    return (
      <h1 className="truncate font-display text-lg font-bold tracking-[-0.02em] text-[var(--text-primary)]">
        New chat
      </h1>
    );
  }

  if (editing) {
    return (
      <form action={formAction} className="flex items-center gap-2">
        <input type="hidden" name="conversationId" value={activeId} />
        <input
          ref={inputRef}
          name="title"
          defaultValue={activeTitle}
          aria-label="Rename thread"
          onKeyDown={(e) => {
            if (e.key === "Escape") setEditing(false);
          }}
          onBlur={(e) => e.currentTarget.form?.requestSubmit()}
          className="min-w-0 flex-1 rounded-md border border-[var(--accent)] bg-[var(--surface-inset)] px-2 py-1 font-display text-lg font-bold tracking-[-0.02em] text-[var(--text-primary)] focus-visible:outline-none"
        />
      </form>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      title="Rename thread"
      className="group flex min-w-0 items-center gap-1.5 text-left"
    >
      <span className="truncate font-display text-lg font-bold tracking-[-0.02em] text-[var(--text-primary)]">
        {activeTitle || "New chat"}
      </span>
      <svg
        viewBox="0 0 20 20"
        aria-hidden
        className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)] opacity-0 transition group-hover:opacity-100"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M4 13.5V16h2.5l8-8L12 5.5l-8 8z" />
      </svg>
    </button>
  );
}

export function MarkChat({
  conversations,
  projects,
  archived,
  showArchived,
  activeId,
  activeTitle,
  activeProjectId,
  activePinned,
  initialMessages,
  mentionGroups,
}: {
  conversations: MarkConversation[];
  projects: MarkProject[];
  archived: MarkConversation[];
  showArchived: boolean;
  activeId: string;
  activeTitle: string;
  activeProjectId: string | null;
  activePinned: boolean;
  initialMessages: MarkMessage[];
  mentionGroups: MentionGroup[];
}) {
  const router = useRouter();
  const [messages, setMessages] = useState<MarkMessage[]>(initialMessages);
  const [draft, setDraft] = useState("");
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const submitFnRef = useRef<(() => void) | null>(null);

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

  function handleRetry() {
    const lastOperator = [...messages].reverse().find((m) => m.role === "operator");
    if (!lastOperator) return;
    setDraft(lastOperator.body);
    // Defer so the composer's hidden inputs pick up the new draft before submit.
    requestAnimationFrame(() => submitFnRef.current?.());
  }

  async function handleStop() {
    setMessages((prev) => prev.filter((m) => !(m.role === "mark" && m.status === "pending")));
    await cancelReplyAction(activeId);
  }

  async function handleRegenerate(markMessageId: string) {
    setMessages((prev) => [
      ...prev,
      {
        id: `temp-pending-${markMessageId}`,
        conversationId: activeId,
        role: "mark",
        body: "",
        status: "pending",
        agentTaskId: null,
        mentions: [],
        media: [],
        steps: [],
        feedback: null,
        createdAt: new Date().toISOString(),
      },
    ]);
    await regenerateMarkReplyAction(activeId, markMessageId);
  }

  const hasMessages = messages.length > 0;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-center justify-between gap-3 pb-3">
        <div className="min-w-0">
          <p className="signal-eyebrow">Mark</p>
          {/* key on activeId so switching threads remounts the editor — never carries
              one thread's in-progress rename text onto another. */}
          <HeaderTitle key={activeId} activeId={activeId} activeTitle={activeTitle} />
          {activeId ? (
            <p className="mt-0.5 truncate text-xs text-[var(--text-muted)]">
              {(activeProjectId ? `${projects.find((p) => p.id === activeProjectId)?.name ?? "Project"} · ` : "") +
                `${messages.length} message${messages.length === 1 ? "" : "s"}`}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {/* Reserved slot: future "what Mark can reach" connections indicator. */}
          {activeId ? (
            <ThreadMenu
              conversationId={activeId}
              projectId={activeProjectId}
              pinned={activePinned}
              projects={projects}
              isActive
            />
          ) : null}
          <Link
            href="/agent-operations"
            className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-3 text-sm font-bold text-[var(--text-secondary)] transition hover:border-[var(--accent)] hover:text-[var(--text-primary)]"
          >
            Operations ▸
          </Link>
        </div>
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
          {hasMessages ? (
            <MessageList messages={messages} onRetry={handleRetry} onStop={handleStop} onRegenerate={handleRegenerate} />
          ) : (
            <ChatEmptyState onPick={pickSuggestion} />
          )}
          <Composer
            conversationId={activeId}
            mentionGroups={mentionGroups}
            draft={draft}
            onDraftChange={setDraft}
            textareaRef={composerRef}
            registerSubmit={(fn) => {
              submitFnRef.current = fn;
            }}
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
