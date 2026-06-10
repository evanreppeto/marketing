"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import type { MarkConversation, MarkMessage, MarkProject } from "@/lib/mark-chat/persistence";
import type { MentionGroup } from "@/lib/mark-chat/mention-search";

import { cx } from "@/app/_components/theme";

import { cancelReplyAction, regenerateMarkReplyAction, renameThreadAction, type SimpleActionState } from "../actions";
import { Composer } from "./composer";
import { ChatEmptyHero, ChatEmptyShortcuts } from "./empty-state";
import { MarkConnection } from "./mark-connection";
import { MessageList } from "./message-list";
import { ThreadContextRail } from "./thread-context-rail";
import { ThreadMenu } from "./thread-menu";
import { ThreadSidebar } from "./thread-sidebar";
import { ThreadSwitcher } from "./thread-switcher";
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
      <h1 className="truncate font-display text-[15px] font-semibold tracking-[-0.01em] text-[var(--text-primary)]">
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
          className="min-w-0 flex-1 rounded-md border border-[var(--accent)] bg-[var(--surface-panel)] px-2 py-0.5 font-display text-[15px] font-semibold tracking-[-0.01em] text-[var(--text-primary)] focus-visible:outline-none"
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
      <span className="truncate font-display text-[15px] font-semibold tracking-[-0.01em] text-[var(--text-primary)]">
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
  operatorName,
  pendingApprovals,
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
  operatorName: string | null;
  pendingApprovals: number;
}) {
  const router = useRouter();
  const [messages, setMessages] = useState<MarkMessage[]>(initialMessages);
  const [draft, setDraft] = useState("");
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const submitFnRef = useRef<(() => void) | null>(null);

  useThreadPoll(activeId, messages, setMessages);

  // Per-thread draft persistence: typed-but-unsent text survives switching
  // threads (and navigating away within the tab). Keyed per thread; "new"
  // covers the blank-composer state.
  const draftKey = `mark:draft:${activeId || "new"}`;

  // Re-seed when the server sends a different thread (navigation), and restore
  // that thread's saved draft.
  useEffect(() => {
    const stored = window.sessionStorage.getItem(`mark:draft:${activeId || "new"}`);
    // Schedule asynchronously to satisfy the set-state-in-effect lint rule.
    void Promise.resolve().then(() => {
      setMessages((prev) => {
        // A revalidation can re-render the bare /mark hero while a first-message
        // send is in flight (optimistic temp bubble on screen, navigation to
        // /mark?c= pending). Re-seeding to the empty server tree would wipe the
        // thread and flash the hero — keep the optimistic view; the pushed
        // thread render re-seeds with real rows.
        if (!activeId && initialMessages.length === 0 && prev.some((m) => m.id.startsWith("temp-"))) {
          return prev;
        }
        return initialMessages;
      });
      setDraft(stored ?? "");
    });
  }, [activeId, initialMessages]);

  function handleDraftChange(value: string) {
    setDraft(value);
    try {
      if (value) window.sessionStorage.setItem(draftKey, value);
      else window.sessionStorage.removeItem(draftKey);
    } catch {
      /* storage unavailable (private mode quota) — drafts just don't persist */
    }
  }

  function pickSuggestion(prompt: string) {
    handleDraftChange(prompt);
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
    handleDraftChange(lastOperator.body);
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
        actions: [],
        createdAt: new Date().toISOString(),
      },
    ]);
    await regenerateMarkReplyAction(activeId, markMessageId);
  }

  const hasMessages = messages.length > 0;
  const [threadsOpen, setThreadsOpen] = useState(false);

  // Close the mobile thread drawer on Escape.
  useEffect(() => {
    if (!threadsOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setThreadsOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [threadsOpen]);

  const meta = activeId
    ? (activeProjectId ? `${projects.find((p) => p.id === activeProjectId)?.name ?? "Project"} · ` : "") +
      `${messages.length} message${messages.length === 1 ? "" : "s"}`
    : "";

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ThreadSwitcher conversations={conversations} projects={projects} activeId={activeId} />
      <div
        className={`grid min-h-0 flex-1 overflow-hidden bg-[var(--canvas)] lg:grid-cols-[16rem_minmax(0,1fr)] ${
          activeId ? "2xl:grid-cols-[16rem_minmax(0,1fr)_15.5rem]" : ""
        }`}
      >
        <ThreadSidebar
          conversations={conversations}
          projects={projects}
          archived={archived}
          showArchived={showArchived}
          activeId={activeId}
        />
        <section className="flex min-h-0 flex-col lg:border-l lg:border-[var(--border-hairline)]">
          <header className="flex min-h-12 items-center gap-3 border-b border-[var(--border-hairline)] px-3 py-2 sm:px-4">
            <button
              type="button"
              onClick={() => setThreadsOpen(true)}
              aria-label="Show conversations"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[var(--text-muted)] transition hover:bg-[var(--surface-inset)] hover:text-[var(--text-primary)] lg:hidden"
            >
              <svg viewBox="0 0 20 20" className="h-4.5 w-4.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <path d="M3.5 5.5h13M3.5 10h13M3.5 14.5h8" />
              </svg>
            </button>
            <div className="min-w-0 flex-1">
              {/* key on activeId so switching threads remounts the editor — never carries
                  one thread's in-progress rename text onto another. */}
              <HeaderTitle key={activeId} activeId={activeId} activeTitle={activeTitle} />
              {meta ? <p className="truncate text-[11px] leading-4 text-[var(--text-muted)]">{meta}</p> : null}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <MarkConnection />
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
                className="inline-flex min-h-8 shrink-0 items-center gap-1 rounded-md px-2.5 text-xs font-medium text-[var(--text-muted)] transition hover:bg-[var(--surface-inset)] hover:text-[var(--text-primary)]"
              >
                Operations
                <svg viewBox="0 0 20 20" aria-hidden className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m8 5 5 5-5 5" />
                </svg>
              </Link>
            </div>
          </header>
          {/* The composer must keep ONE stable tree slot across the empty→thread
              flip. If it rendered inside the empty-state component, sending the
              first message would remount it mid-action, dropping the in-flight
              useActionState result — and the router.push to the new thread with
              it, so the send appeared to do nothing. Conditional siblings keep
              their slots; only the hero/list slot swaps. */}
          <div
            className={cx(
              "flex min-h-0 flex-1 flex-col",
              !hasMessages && "items-center justify-center gap-7 overflow-y-auto px-4 py-10 sm:px-6",
            )}
          >
            {hasMessages ? (
              <MessageList
                messages={messages}
                onRetry={handleRetry}
                onStop={handleStop}
                onRegenerate={handleRegenerate}
              />
            ) : (
              <ChatEmptyHero operatorName={operatorName} />
            )}
            <div
              className={hasMessages ? "w-full" : "msg-rise w-full max-w-2xl"}
              style={hasMessages ? undefined : { animationDelay: "60ms" }}
            >
              <Composer
                conversationId={activeId}
                mentionGroups={mentionGroups}
                draft={draft}
                onDraftChange={handleDraftChange}
                textareaRef={composerRef}
                registerSubmit={(fn) => {
                  submitFnRef.current = fn;
                }}
                onOptimistic={(optimistic) => setMessages((prev) => [...prev, optimistic])}
                onSent={(newConversationId) => {
                  try {
                    window.sessionStorage.removeItem(draftKey);
                  } catch {
                    /* ignore */
                  }
                  if (!activeId && newConversationId) {
                    router.push(`/mark?c=${newConversationId}`);
                  } else {
                    router.refresh();
                  }
                }}
              />
            </div>
            {!hasMessages ? <ChatEmptyShortcuts onPick={pickSuggestion} pendingApprovals={pendingApprovals} /> : null}
          </div>
        </section>

        {activeId ? <ThreadContextRail messages={messages} pendingApprovals={pendingApprovals} /> : null}
      </div>

      {threadsOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Conversations">
          <div className="absolute inset-0 bg-[var(--overlay)] backdrop-blur-sm" onClick={() => setThreadsOpen(false)} />
          <div
            className="msg-rise absolute inset-y-0 left-0 flex w-72 flex-col overflow-hidden border-r border-[var(--border-panel)] bg-[var(--surface-panel)] shadow-[var(--elev-raised)]"
            onClick={(e) => {
              // Navigating to a thread should dismiss the drawer.
              if ((e.target as HTMLElement).closest("a")) setThreadsOpen(false);
            }}
          >
            <ThreadSidebar
              conversations={conversations}
              projects={projects}
              archived={archived}
              showArchived={showArchived}
              activeId={activeId}
              variant="overlay"
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
