"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import type { MarkConversation, MarkMessage, MarkProject } from "@/lib/mark-chat/persistence";
import type { MentionGroup } from "@/lib/mark-chat/mention-search";
import type { MarkMode, MarkRoute } from "@/domain";

import { cx } from "@/app/_components/theme";

import { cancelReplyAction, regenerateMarkReplyAction, renameThreadAction, type SimpleActionState } from "../actions";
import Link from "next/link";

import { ChatSettings } from "./chat-settings";
import { CommandPalette } from "./command-palette";
import { MarkBackdrop } from "./mark-backdrop";
import type { SlashCommand } from "./slash-commands";
import { Composer } from "./composer";
import { ChatEmptyHero, ChatEmptyShortcuts } from "./empty-state";
import { MarkConnection } from "./mark-connection";
import { MessageList } from "./message-list";
import { WorkCanvas } from "./work-canvas";
import { ThreadMenu } from "./thread-menu";
import { ThreadSidebar } from "./thread-sidebar";
import { ThreadSwitcher } from "./thread-switcher";
import { useThreadPoll } from "./use-thread-poll";
import { demoReply } from "../_data/demo";

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
  activeCampaignId,
  campaigns,
  activePinned,
  initialMessages,
  mentionGroups,
  operatorName,
  pendingApprovals,
  defaultMode = "act",
  defaultRoute = "fast",
  demo = false,
}: {
  conversations: MarkConversation[];
  projects: MarkProject[];
  archived: MarkConversation[];
  showArchived: boolean;
  activeId: string;
  activeTitle: string;
  activeProjectId: string | null;
  activeCampaignId: string | null;
  campaigns: { id: string; name: string }[];
  activePinned: boolean;
  initialMessages: MarkMessage[];
  mentionGroups: MentionGroup[];
  operatorName: string | null;
  pendingApprovals: number;
  defaultMode?: MarkMode;
  defaultRoute?: MarkRoute;
  /** Preview mode: render the full UI with sample data, no backend writes. */
  demo?: boolean;
}) {
  const router = useRouter();
  const [messages, setMessages] = useState<MarkMessage[]>(initialMessages);
  // Preview-only optimistic review: real mode persists via the server action, but
  // in demo we flip the asset's status locally so the full approve/decline/revision
  // loop is demonstrable.
  const [statusOverrides, setStatusOverrides] = useState<Record<string, "approved" | "rejected" | "revision">>({});
  const [draft, setDraft] = useState("");
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const submitFnRef = useRef<(() => void) | null>(null);
  const applyCommandRef = useRef<((cmd: SlashCommand) => void) | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);

  // Work canvas visibility. Docked as a third column at xl+, a slide-over drawer
  // below that. One flag drives both: at xl it expands/collapses the column; below
  // xl it opens/closes the drawer. Defaults open (matches the wide layout), but on
  // first mount we collapse it on narrow viewports so the drawer never covers the
  // chat on load. `canvasMounted` gates the drawer markup to avoid an SSR flash.
  const [canvasOpen, setCanvasOpen] = useState(true);
  const [canvasMounted, setCanvasMounted] = useState(false);
  useEffect(() => {
    // Schedule asynchronously to satisfy the set-state-in-effect lint rule.
    void Promise.resolve().then(() => {
      setCanvasMounted(true);
      if (typeof window !== "undefined" && !window.matchMedia("(min-width: 1280px)").matches) {
        setCanvasOpen(false);
      }
    });
  }, []);

  // Lets the chat open the Studio focused on a specific asset. `seq` bumps so the
  // Studio re-focuses even when the same asset is requested twice.
  const [studioFocus, setStudioFocus] = useState<{ assetId: string; seq: number } | null>(null);
  const focusSeq = useRef(0);
  function openStudioAsset(assetId?: string) {
    setCanvasOpen(true);
    if (assetId) {
      focusSeq.current += 1;
      setStudioFocus({ assetId, seq: focusSeq.current });
    }
  }

  // No polling in preview mode (it would hit the server and fail).
  useThreadPoll(demo ? "" : activeId, messages, setMessages);

  // Preview-mode send: append the operator message + a canned Mark reply locally.
  function demoSend(text: string) {
    if (!text.trim()) return;
    const now = new Date().toISOString();
    setMessages((prev) => [
      ...prev,
      {
        id: `demo-op-${prev.length}`,
        conversationId: activeId,
        role: "operator",
        body: text.trim(),
        status: "sent",
        agentTaskId: null,
        mentions: [],
        media: [],
        steps: [],
        feedback: null,
        actions: [],
        suggestions: [],
        attachments: [],
        createdAt: now,
      },
    ]);
    setDraft("");
    window.setTimeout(() => setMessages((prev) => [...prev, demoReply(text)]), 650);
  }

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
        suggestions: [],
        attachments: [],
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

  // ⌘K / Ctrl+K toggles the command palette from anywhere in the chat.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const replyPending = messages.some((m) => m.role === "mark" && m.status === "pending");

  // The campaign this thread is producing — drives the Studio Assets-tab cover.
  const activeCampaign = activeCampaignId
    ? { id: activeCampaignId, name: campaigns.find((c) => c.id === activeCampaignId)?.name ?? "Campaign" }
    : undefined;

  // Apply preview-mode optimistic approvals onto the rendered messages so the deck,
  // library tiles, and cover progress all reflect a click without a backend.
  const displayMessages = useMemo(() => {
    if (Object.keys(statusOverrides).length === 0) return messages;
    return messages.map((m) => ({
      ...m,
      actions: m.actions.map((a) => {
        const id = a.approval?.assetId;
        const next = id ? statusOverrides[id] : undefined;
        return next ? { ...a, status: next } : a;
      }),
    }));
  }, [messages, statusOverrides]);

  function demoDecide(assetId: string, decision: "approved" | "declined" | "revision") {
    const status = decision === "declined" ? "rejected" : decision === "revision" ? "revision" : "approved";
    setStatusOverrides((prev) => ({ ...prev, [assetId]: status }));
  }

  const meta = activeId
    ? (activeProjectId ? `${projects.find((p) => p.id === activeProjectId)?.name ?? "Project"} · ` : "") +
      `${messages.length} message${messages.length === 1 ? "" : "s"}`
    : "";

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ThreadSwitcher conversations={conversations} projects={projects} activeId={activeId} />
      <div
        className={`grid min-h-0 flex-1 overflow-hidden bg-[var(--canvas)] lg:grid-cols-[16rem_minmax(0,1fr)] ${
          activeId && canvasOpen ? "xl:grid-cols-[16rem_minmax(0,1fr)_22rem] 2xl:grid-cols-[16rem_minmax(0,1fr)_25rem]" : ""
        }`}
      >
        <ThreadSidebar
          conversations={conversations}
          projects={projects}
          archived={archived}
          showArchived={showArchived}
          activeId={activeId}
        />
        <section className="relative flex min-h-0 flex-col lg:border-l lg:border-[var(--border-hairline)]">
          {/* Ambient silk backdrop — the 21st.dev MeshGradient shader, obsidian+gold. */}
          <MarkBackdrop />
          <header className="relative z-20 flex min-h-12 items-center gap-3 border-b border-[var(--border-hairline)] px-3 py-2 sm:px-4">
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
              {activeId && activeCampaignId ? (
                <Link
                  href={`/campaigns/${activeCampaignId}`}
                  className="hidden items-center gap-1 rounded-md bg-[var(--accent-soft)] px-2 py-0.5 text-[11px] font-medium text-[var(--accent-contrast)] shadow-[inset_0_0_0_1px_var(--accent-border-strong)] transition hover:text-[var(--text-primary)] sm:inline-flex"
                >
                  {campaigns.find((c) => c.id === activeCampaignId)?.name ?? "Campaign"}
                </Link>
              ) : null}
              <MarkConnection />
              {activeId ? (
                <>
                  <button
                    type="button"
                    onClick={() => setCanvasOpen((v) => !v)}
                    aria-pressed={canvasOpen}
                    title={canvasOpen ? "Hide Studio" : "Show Studio"}
                    aria-label={canvasOpen ? "Hide Studio" : "Show Studio"}
                    className={cx(
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition hover:bg-[var(--surface-inset)]",
                      canvasOpen ? "text-[var(--accent-contrast)]" : "text-[var(--text-muted)] hover:text-[var(--text-primary)]",
                    )}
                  >
                    <svg viewBox="0 0 20 20" className="h-4.5 w-4.5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="4" width="14" height="12" rx="2" />
                      <path d="M12.5 4v12" />
                    </svg>
                  </button>
                  <ChatSettings
                    conversationId={activeId}
                    projects={projects}
                    activeProjectId={activeProjectId}
                    campaigns={campaigns}
                    activeCampaignId={activeCampaignId}
                  />
                  <ThreadMenu
                    conversationId={activeId}
                    projectId={activeProjectId}
                    pinned={activePinned}
                    projects={projects}
                    isActive
                  />
                </>
              ) : null}
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
              "relative z-10 flex min-h-0 flex-1 flex-col",
              !hasMessages && "items-center justify-center gap-7 overflow-y-auto px-4 py-10 sm:px-6",
            )}
          >
            {hasMessages ? (
              <MessageList
                messages={displayMessages}
                onRetry={handleRetry}
                onStop={handleStop}
                onRegenerate={handleRegenerate}
                onSuggestion={pickSuggestion}
                onOpenAsset={openStudioAsset}
                onDecision={demo ? demoDecide : undefined}
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
                demo={demo}
                onDemoSend={demoSend}
                registerSubmit={(fn) => {
                  submitFnRef.current = fn;
                }}
                registerApplyCommand={(fn) => {
                  applyCommandRef.current = fn;
                }}
                replyPending={replyPending}
                onStopReply={handleStop}
                projects={projects}
                activeProjectId={activeProjectId}
                defaultMode={defaultMode}
                defaultRoute={defaultRoute}
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

        {activeId ? <WorkCanvas messages={displayMessages} open={canvasOpen} focus={studioFocus} campaign={activeCampaign} onDecision={demo ? demoDecide : undefined} /> : null}
      </div>

      {/* Below xl the canvas isn't docked — open it as a right-side slide-over so the
          deliverable is reachable on laptops without crowding the chat. */}
      {activeId && canvasMounted && canvasOpen ? (
        <div className="fixed inset-0 z-50 xl:hidden" role="dialog" aria-modal="true" aria-label="Studio">
          <div className="absolute inset-0 bg-[var(--overlay)] backdrop-blur-sm" onClick={() => setCanvasOpen(false)} />
          <div className="msg-rise absolute inset-y-0 right-0 flex w-[22rem] max-w-[88vw] flex-col overflow-hidden border-l border-[var(--border-panel)] bg-[var(--surface-panel)] shadow-[var(--elev-raised)]">
            <div className="flex shrink-0 items-center justify-between border-b border-[var(--border-hairline)] px-4 py-2.5">
              <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">Studio</span>
              <button
                type="button"
                onClick={() => setCanvasOpen(false)}
                aria-label="Close Studio"
                className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--text-muted)] transition hover:bg-[var(--surface-inset)] hover:text-[var(--text-primary)]"
              >
                <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                  <path d="M5 5l10 10M15 5L5 15" />
                </svg>
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-hidden">
              <WorkCanvas messages={displayMessages} variant="drawer" focus={studioFocus} campaign={activeCampaign} onDecision={demo ? demoDecide : undefined} />
            </div>
          </div>
        </div>
      ) : null}

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

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onSelect={(cmd) => applyCommandRef.current?.(cmd)}
      />
    </div>
  );
}
