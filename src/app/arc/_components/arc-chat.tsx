"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import type { ArcConversation, ArcMessage, ArcProject } from "@/lib/arc-chat/persistence";
import type { MentionGroup } from "@/lib/arc-chat/mention-search";
import type { ArcMode, ArcRoute } from "@/domain";

import { cx } from "@/app/_components/theme";

import { cancelReplyAction, editAndResendArcMessageAction, getActiveArcRunsAction, regenerateArcReplyAction, renameThreadAction, type SimpleActionState } from "../actions";
import Link from "next/link";

import { ChatSettings } from "./chat-settings";
import { CommandPalette } from "./command-palette";
import { AgentSettingsDrawer } from "./agent-settings-drawer";
import { RunsDrawer } from "./runs-drawer";
import { ContextMeter } from "./context-meter";
import { ArcBackdrop } from "./arc-backdrop";
import type { SlashCommand } from "./slash-commands";
import { Composer } from "./composer";
import { ChatEmptyHero, ChatEmptyShortcuts } from "./empty-state";
import { ArcConnection } from "./arc-connection";
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

/** An optimistic "thinking" arc bubble used while a regenerate/edit is in flight. */
function pendingArcMessage(id: string, conversationId: string): ArcMessage {
  return {
    id,
    conversationId,
    role: "arc",
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
  };
}

export function ArcChat({
  conversations,
  projects,
  archived,
  showArchived,
  activeId,
  activeTitle,
  activeProjectId,
  newChatProjectId = null,
  initialSkill = null,
  activeCampaignId,
  campaigns,
  activePinned,
  initialMessages,
  projectMessages = [],
  mentionGroups,
  operatorName,
  pendingApprovals,
  defaultMode = "act",
  defaultRoute = "fast",
  assistantName = "Agent",
  demo = false,
}: {
  conversations: ArcConversation[];
  projects: ArcProject[];
  archived: ArcConversation[];
  showArchived: boolean;
  activeId: string;
  activeTitle: string;
  activeProjectId: string | null;
  /** Pre-selected project for a fresh chat, from the ?project=<id> deep link. */
  newChatProjectId?: string | null;
  /** Skill (slash-command id) to pre-apply on a fresh chat, from ?skill=<id>. */
  initialSkill?: string | null;
  activeCampaignId: string | null;
  campaigns: { id: string; name: string }[];
  activePinned: boolean;
  initialMessages: ArcMessage[];
  /** Asset-bearing messages from sibling chats in this chat's project (Studio Assets tab). */
  projectMessages?: ArcMessage[];
  mentionGroups: MentionGroup[];
  operatorName: string | null;
  pendingApprovals: number;
  defaultMode?: ArcMode;
  defaultRoute?: ArcRoute;
  assistantName?: string;
  /** Preview mode: render the full UI with sample data, no backend writes. */
  demo?: boolean;
}) {
  const router = useRouter();
  const [messages, setMessages] = useState<ArcMessage[]>(initialMessages);
  // Preview-only optimistic review: real mode persists via the server action, but
  // in demo we flip the asset's status locally so the full approve/decline/revision
  // loop is demonstrable.
  const [statusOverrides, setStatusOverrides] = useState<Record<string, "approved" | "rejected" | "revision">>({});
  const [draft, setDraft] = useState("");
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const submitFnRef = useRef<(() => void) | null>(null);
  const applyCommandRef = useRef<((cmd: SlashCommand) => void) | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [agentSettingsOpen, setAgentSettingsOpen] = useState(false);
  const [runsOpen, setRunsOpen] = useState(false);
  // Per-message mode/route, seeded from Settings defaults. Lifted here (not in the
  // composer) so Regenerate reuses the same live selection instead of a hard-coded one.
  const [mode, setMode] = useState<ArcMode>(defaultMode);
  const [route, setRoute] = useState<ArcRoute>(defaultRoute);
  // When the composer's command menu is open, the empty-state quick cards hide so
  // the same four actions never appear twice (floating list + cards).
  const [composerSlashOpen, setComposerSlashOpen] = useState(false);

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

  // Preview-mode send: append the operator message + a canned Arc reply locally.
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
  const draftKey = `arc:draft:${activeId || "new"}`;

  // Re-seed when the server sends a different thread (navigation), and restore
  // that thread's saved draft.
  useEffect(() => {
    const stored = window.sessionStorage.getItem(`arc:draft:${activeId || "new"}`);
    // Schedule asynchronously to satisfy the set-state-in-effect lint rule.
    void Promise.resolve().then(() => {
      setMessages((prev) => {
        // A revalidation can re-render the bare /arc hero while a first-message
        // send is in flight (optimistic temp bubble on screen, navigation to
        // /arc?c= pending). Re-seeding to the empty server tree would wipe the
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
    setMessages((prev) => prev.filter((m) => !(m.role === "arc" && m.status === "pending")));
    await cancelReplyAction(activeId);
  }

  // Swap a stuck optimistic "thinking" bubble for a failed reply so a server
  // error surfaces instead of hanging the thread forever.
  function replacePendingWithFailure(tempId: string, message?: string) {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === tempId
          ? { ...m, status: "failed" as const, body: message || `${assistantName} couldn't complete that — try again.` }
          : m,
      ),
    );
  }

  async function handleRegenerate(markMessageId: string) {
    const tempId = `temp-pending-${markMessageId}-${Date.now()}`;
    setMessages((prev) => [...prev, pendingArcMessage(tempId, activeId)]);
    try {
      await regenerateArcReplyAction(activeId, markMessageId, { mode, route });
    } catch {
      // Drop the stuck "thinking" bubble and show what happened instead of hanging.
      replacePendingWithFailure(tempId);
    }
  }

  // Edit a sent operator message in place and re-run the reply (ChatGPT-style).
  // Mirrors regenerate's append semantics: the bubble text updates and Arc
  // responds again at the bottom of the thread.
  async function handleEditResend(messageId: string, newBody: string) {
    const body = newBody.trim();
    if (!body) return;
    if (demo) {
      setMessages((prev) => {
        if (!prev.some((m) => m.id === messageId)) return prev;
        const updated = prev.map((m) => (m.id === messageId ? { ...m, body } : m));
        return [...updated, demoReply(body)];
      });
      return;
    }
    const tempId = `temp-pending-edit-${messageId}-${Date.now()}`;
    setMessages((prev) => {
      if (!prev.some((m) => m.id === messageId)) return prev;
      const updated = prev.map((m) => (m.id === messageId ? { ...m, body } : m));
      return [...updated, pendingArcMessage(tempId, activeId)];
    });
    try {
      const result = await editAndResendArcMessageAction(activeId, messageId, body, { mode, route });
      if (!result.ok) replacePendingWithFailure(tempId, result.message);
    } catch {
      replacePendingWithFailure(tempId);
    }
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

  const replyPending = messages.some((m) => m.role === "arc" && m.status === "pending");

  // Esc stops the in-flight reply (ChatGPT muscle-memory). Skips when an inline
  // editor / menu already handled Escape (defaultPrevented) so it doesn't fight
  // the message editor's own cancel.
  useEffect(() => {
    if (!replyPending) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !e.defaultPrevented) void handleStop();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // handleStop is stable enough for this lightweight handler.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [replyPending]);

  // Cross-thread run visibility (Codex-style): the sidebar shows a spinner while
  // Arc works a thread, then a pulse once the reply lands on a thread you're not
  // viewing, which clears when you open it. `runningIds` is the live server set;
  // `doneIds` accumulates threads that finished while you were elsewhere.
  const [runningIds, setRunningIds] = useState<Set<string>>(() => new Set());
  const [doneIds, setDoneIds] = useState<Set<string>>(() => new Set());
  const prevRunningRef = useRef<Set<string>>(new Set());
  const activeIdRef = useRef(activeId);
  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);
  useEffect(() => {
    if (demo) return;
    let alive = true;
    async function tick() {
      // Don't poll a backgrounded tab — saves needless server hits + battery.
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      try {
        const ids = await getActiveArcRunsAction();
        if (!alive) return;
        const next = new Set(ids);
        // A thread that was running last tick but isn't now just finished — mark
        // it unread unless it's the one you're already looking at.
        const finished: string[] = [];
        prevRunningRef.current.forEach((id) => {
          if (!next.has(id) && id !== activeIdRef.current) finished.push(id);
        });
        if (finished.length > 0) {
          setDoneIds((prev) => {
            const merged = new Set(prev);
            for (const id of finished) merged.add(id);
            return merged;
          });
        }
        prevRunningRef.current = next;
        setRunningIds(next);
      } catch {
        /* best-effort; keep the last known set */
      }
    }
    void tick();
    const id = setInterval(tick, 4000);
    // Refresh immediately when the tab comes back to the foreground.
    function onVisible() {
      if (document.visibilityState === "visible") void tick();
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [demo]);

  // Opening a thread clears its unread pulse. Deferred to dodge the
  // set-state-in-effect lint rule (same pattern as elsewhere in this file).
  useEffect(() => {
    if (!doneIds.has(activeId)) return;
    void Promise.resolve().then(() =>
      setDoneIds((prev) => {
        if (!prev.has(activeId)) return prev;
        const next = new Set(prev);
        next.delete(activeId);
        return next;
      }),
    );
  }, [activeId, doneIds]);

  // Merge the live server set with the active thread's optimistic pending state
  // so the spinner appears the instant you send, before the next poll.
  const runningConversationIds = useMemo(() => {
    const set = new Set(runningIds);
    if (replyPending && activeId) set.add(activeId);
    return set;
  }, [runningIds, replyPending, activeId]);

  // Never show a "done" pulse on a thread that's currently working or in view.
  const doneConversationIds = useMemo(() => {
    const set = new Set(doneIds);
    set.delete(activeId);
    runningConversationIds.forEach((id) => set.delete(id));
    return set;
  }, [doneIds, activeId, runningConversationIds]);

  // The campaign this thread is producing — drives the Studio Assets-tab cover.
  const activeCampaign = activeCampaignId
    ? { id: activeCampaignId, name: campaigns.find((c) => c.id === activeCampaignId)?.name ?? "Campaign" }
    : undefined;

  // id -> title, so the Studio can label assets that came from a sibling chat.
  const conversationTitles = useMemo(
    () => Object.fromEntries(conversations.map((c) => [c.id, c.title] as const)),
    [conversations],
  );

  // Context for a fresh chat opened via the "new chat in project" deep link: name
  // the project and surface what Arc can build on (sibling chats + project assets).
  const emptyHeroProject = useMemo(() => {
    if (activeId || !newChatProjectId) return null;
    const project = projects.find((p) => p.id === newChatProjectId);
    if (!project) return null;
    const chatCount = conversations.filter((c) => c.projectId === newChatProjectId).length;
    const images = projectMessages.flatMap((m) => m.media).filter((md) => md.kind === "image");
    return {
      name: project.name,
      chatCount,
      assetCount: images.length,
      thumbnails: images.map((md) => md.thumbnailUrl ?? md.url).slice(0, 5),
    };
  }, [activeId, newChatProjectId, projects, conversations, projectMessages]);

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
          assistantName={assistantName}
          runningIds={runningConversationIds}
          doneIds={doneConversationIds}
        />
        <section className="relative flex min-h-0 flex-col lg:border-l lg:border-[var(--border-hairline)]">
          {/* Ambient silk backdrop — the 21st.dev MeshGradient shader, obsidian+gold. */}
          <ArcBackdrop />
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
              {hasMessages ? <ContextMeter messages={messages} /> : null}
              <button
                type="button"
                onClick={() => setRunsOpen(true)}
                title="Runs — see what Arc is working on across all threads"
                aria-label="Open runs"
                className="relative inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium text-[var(--text-secondary)] shadow-[inset_0_0_0_1px_var(--border-hairline)] transition hover:bg-[var(--surface-inset)] hover:text-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
              >
                <svg viewBox="0 0 20 20" aria-hidden className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="10" cy="10" r="7" />
                  <path d="M10 6v4l2.5 1.5" />
                </svg>
                <span className="hidden sm:inline">Runs</span>
                {runningConversationIds.size > 0 ? (
                  <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--accent)] px-1 text-[10px] font-semibold tabular-nums text-[var(--on-accent)]">
                    {runningConversationIds.size}
                  </span>
                ) : null}
              </button>
              {demo ? (
                <button
                  type="button"
                  onClick={() => setAgentSettingsOpen(true)}
                  title="Preview mode — Arc is showing sample data because it isn't connected to the database. Sends, approvals, and other actions are simulated and won't be saved. Click to see connection settings."
                  aria-label="Preview mode — Arc is not connected to the database. Actions are simulated. Open connection settings."
                  className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium text-[var(--warn)] shadow-[inset_0_0_0_1px_var(--border-hairline)] transition hover:bg-[var(--surface-inset)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
                >
                  <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-[var(--warn)]" />
                  <span className="hidden sm:inline">Preview mode</span>
                  <span className="sm:hidden">Preview</span>
                </button>
              ) : null}
              {activeId && activeCampaignId ? (
                <Link
                  href={`/campaigns/${activeCampaignId}`}
                  className="hidden items-center gap-1 rounded-md bg-[var(--accent-soft)] px-2 py-0.5 text-[11px] font-medium text-[var(--accent-contrast)] shadow-[inset_0_0_0_1px_var(--accent-border-strong)] transition hover:text-[var(--text-primary)] sm:inline-flex"
                >
                  {campaigns.find((c) => c.id === activeCampaignId)?.name ?? "Campaign"}
                </Link>
              ) : null}
              <button
                type="button"
                onClick={() => setAgentSettingsOpen(true)}
                title="Agent settings"
                aria-label="Agent settings"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[var(--text-muted)] transition hover:bg-[var(--surface-inset)] hover:text-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
              >
                <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 13a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 8 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H2a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 3.6 8a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H8a1.65 1.65 0 0 0 1-1.51V2a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V8a1.65 1.65 0 0 0 1.51 1H22a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
                </svg>
              </button>
              <ArcConnection />
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
                    title={activeTitle}
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
              !hasMessages && "items-center justify-center gap-6 overflow-y-auto px-4 py-10 sm:px-6",
            )}
          >
            {hasMessages ? (
              <MessageList
                messages={displayMessages}
                assistantName={assistantName}
                onRetry={handleRetry}
                onStop={handleStop}
                onRegenerate={handleRegenerate}
                onEditResend={handleEditResend}
                onSuggestion={pickSuggestion}
                onOpenAsset={openStudioAsset}
                onDecision={demo ? demoDecide : undefined}
              />
            ) : (
              <ChatEmptyHero assistantName={assistantName} operatorName={operatorName} project={emptyHeroProject} />
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
                onSlashOpenChange={setComposerSlashOpen}
                registerSubmit={(fn) => {
                  submitFnRef.current = fn;
                }}
                registerApplyCommand={(fn) => {
                  applyCommandRef.current = fn;
                }}
                replyPending={replyPending}
                onStopReply={handleStop}
                recallText={[...messages].reverse().find((m) => m.role === "operator")?.body ?? null}
                projects={projects}
                activeProjectId={activeProjectId}
                initialNewChatProjectId={newChatProjectId}
                initialSkill={initialSkill}
                mode={mode}
                route={route}
                onModeChange={setMode}
                onRouteChange={setRoute}
                assistantName={assistantName}
                onOptimistic={(optimistic) => setMessages((prev) => [...prev, optimistic])}
                onSent={(newConversationId) => {
                  try {
                    window.sessionStorage.removeItem(draftKey);
                  } catch {
                    /* ignore */
                  }
                  if (!activeId && newConversationId) {
                    router.push(`/arc?c=${newConversationId}`);
                  } else {
                    router.refresh();
                  }
                }}
              />
            </div>
            {!hasMessages && !composerSlashOpen ? <ChatEmptyShortcuts assistantName={assistantName} onPick={pickSuggestion} pendingApprovals={pendingApprovals} /> : null}
          </div>
        </section>

        {activeId ? (
          <WorkCanvas
            messages={displayMessages}
            projectMessages={projectMessages}
            currentConversationId={activeId}
            conversationTitles={conversationTitles}
            open={canvasOpen}
            focus={studioFocus}
            campaign={activeCampaign}
            assistantName={assistantName}
            onDecision={demo ? demoDecide : undefined}
          />
        ) : null}
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
              <WorkCanvas
                messages={displayMessages}
                projectMessages={projectMessages}
                currentConversationId={activeId}
                conversationTitles={conversationTitles}
                variant="drawer"
                focus={studioFocus}
                campaign={activeCampaign}
                assistantName={assistantName}
                onDecision={demo ? demoDecide : undefined}
              />
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
              assistantName={assistantName}
              runningIds={runningConversationIds}
              doneIds={doneConversationIds}
            />
          </div>
        </div>
      ) : null}

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onSelect={(cmd) => applyCommandRef.current?.(cmd)}
      />
      <AgentSettingsDrawer open={agentSettingsOpen} onClose={() => setAgentSettingsOpen(false)} />
      <RunsDrawer open={runsOpen} onClose={() => setRunsOpen(false)} />
    </div>
  );
}
