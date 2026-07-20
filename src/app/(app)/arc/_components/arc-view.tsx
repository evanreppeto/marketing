"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import CircularProgress from "@mui/material/CircularProgress";
import {
  Fragment,
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import {
  Archive,
  ArrowUp,
  AtSign,
  Check,
  ChevronDown,
  Gauge,
  Hammer,
  LoaderCircle,
  Menu,
  MoreHorizontal,
  PanelRightClose,
  PanelRightOpen,
  Paperclip,
  PencilLine,
  Pin,
  Plus,
  Search,
  Share2,
  Slash,
  Sparkles,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";

import {
  type ArcActionCard,
  type ArcAssetStatus,
  type ArcMention,
  type ArcMode,
  type ArcRoute,
  type SharePermission,
  type ShareVisibility,
} from "@/domain";
import { contextUsage } from "@/lib/arc-chat/context-usage";
import type {
  ArcAttachment,
  ArcMessage,
  ArcStep,
} from "@/lib/arc-chat/persistence";
import type { MentionGroup } from "@/lib/arc-chat/mention-search";
import type { ArcThreadGroupVM } from "@/lib/arc-chat/read-model";
import { filterThreadGroups } from "@/lib/arc-chat/thread-filter";
import { resolveArcModelRoute, type ArcModelPreference } from "@/lib/arc-chat/model-routing";
import { buildArcRunContract } from "@/lib/arc-chat/run-contract";
import { buildArcRunProfile, inferArcRunIntent } from "@/lib/arc-chat/run-profile";
import { getArcConversationHeader, shouldShowDemoLauncher } from "@/lib/arc-chat/view-state";

import {
  archiveArcConversationAction,
  cancelArcRunAction,
  deleteArcConversationAction,
  editAndResendArcMessageAction,
  pinArcConversationAction,
  regenerateArcReplyAction,
  renameArcConversationAction,
  sendArcMessageAction,
  uploadArcAttachmentAction,
} from "../actions";
import {
  getChatSharingStateAction,
  setChatSharingAction,
  shareChatWithMemberAction,
  unshareChatMemberAction,
  type ChatSharingState,
} from "../sharing-actions";
import type {
  ArcWaiting,
  ComposerMenu,
  DemoTurn,
  ThreadItem,
} from "./arc-view.types";
import { DEMO_PACKAGE_CARDS, DEMO_THREADS, DEMO_WAITING } from "./arc-demo-data";
import { ArcWorkPanel, AssetReviewPanel, ChipThumb, QuestionPrompt } from "./arc-messages";
import { ArcLauncher, DemoConversation, LiveConversation } from "./arc-conversation";


const MODEL_OPTIONS: Array<{ id: ArcModelPreference; label: string; description: string }> = [
  { id: "auto", label: "Arc Auto", description: "Chooses Spark or Forge for every prompt" },
  { id: "fast", label: "Arc Spark", description: "Fast answers and everyday requests" },
  { id: "standard", label: "Arc Forge", description: "Deeper reasoning for complex work" },
];

const ARC_CONTEXT_SCOPES = ["workspace", "brand", "crm", "campaigns"];

const COMMAND_OPTIONS: Array<{ id: string; label: string; description: string; mode: ArcMode }> = [
  { id: "find-leads", label: "Find leads", description: "Search and rank opportunities", mode: "act" },
  { id: "draft-email", label: "Draft email", description: "Prepare an approval-safe email", mode: "draft" },
  { id: "draft-campaign", label: "Draft campaign", description: "Build a multi-channel package", mode: "draft" },
  { id: "summarize", label: "Summarize", description: "Condense the selected context", mode: "ask" },
];

function inferComposerMode(request: string, command: string | null): ArcMode {
  const commandMode = COMMAND_OPTIONS.find((option) => option.id === command)?.mode;
  if (commandMode) return commandMode;

  const intent = inferArcRunIntent({ request });
  if (intent === "create") return "draft";
  if (intent === "action") return "act";
  return "ask";
}

function ArcModelIcon({ model, size }: { model: ArcModelPreference; size: number }) {
  if (model === "auto") return <Sparkles size={size} />;
  if (model === "fast") return <Gauge size={size} />;
  return <Hammer size={size} />;
}

function ThreadRow({ thread, active, live, onOpen, onRename, onPin, onArchive, onDelete }: {
  thread: ThreadItem;
  active: boolean;
  live: boolean;
  onOpen: () => void;
  onRename: (title: string) => void;
  onPin: (pinned: boolean) => void;
  onArchive: () => void;
  onDelete: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(thread.title);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!menuOpen) return;
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Element && !event.target.closest(`[data-thread="${thread.id}"]`)) {
        setMenuOpen(false);
        setConfirmDelete(false);
      }
    };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [menuOpen, thread.id]);

  const commitRename = () => {
    const next = name.trim();
    setRenaming(false);
    if (next && next !== thread.title) onRename(next);
    else setName(thread.title);
  };

  if (renaming) {
    return (
      <div className="arc-history-item is-renaming" data-thread={thread.id}>
        <input
          autoFocus
          value={name}
          aria-label="Rename conversation"
          onChange={(event) => setName(event.target.value)}
          onBlur={commitRename}
          onKeyDown={(event) => {
            if (event.key === "Enter") { event.preventDefault(); commitRename(); }
            if (event.key === "Escape") { setName(thread.title); setRenaming(false); }
          }}
        />
      </div>
    );
  }

  const label = (
    <span>
      <b>{thread.title}</b>
      {thread.running
        ? <small className="arc-thread-working"><span className="arc-thread-dots" aria-hidden="true"><i /><i /><i /></span>Working…</small>
        : <small>{thread.when}</small>}
    </span>
  );

  return (
    <div className={`arc-history-item${active ? " is-active" : ""}`} data-thread={thread.id}>
      {live
        ? <Link href={`/arc?c=${thread.id}`} className="arc-history-open" onClick={onOpen}>{label}</Link>
        : <button type="button" className="arc-history-open" onClick={onOpen}>{label}</button>}
      {thread.pinned ? <Pin size={12} className="arc-history-pin" aria-label="Pinned" /> : null}
      <button type="button" className="arc-history-menu-btn" aria-label="Conversation options" aria-haspopup="menu" aria-expanded={menuOpen} onClick={(event) => { event.preventDefault(); event.stopPropagation(); setConfirmDelete(false); setMenuOpen((open) => !open); }}>
        <MoreHorizontal size={15} />
      </button>
      {menuOpen ? (
        <div className="arc-history-menu" role="menu">
          {confirmDelete ? (
            <div className="arc-history-menu-confirm">
              <span>Delete this conversation?</span>
              <div>
                <button type="button" onClick={() => setConfirmDelete(false)}>Cancel</button>
                <button type="button" className="is-danger" onClick={() => { setMenuOpen(false); onDelete(); }}>Delete</button>
              </div>
            </div>
          ) : (
            <>
              <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); onPin(!thread.pinned); }}><Pin size={14} />{thread.pinned ? "Unpin" : "Pin"}</button>
              <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); setName(thread.title); setRenaming(true); }}><PencilLine size={14} />Rename</button>
              <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); onArchive(); }}><Archive size={14} />Archive</button>
              <button type="button" role="menuitem" className="is-danger" onClick={() => setConfirmDelete(true)}><Trash2 size={14} />Delete</button>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

function ThreadDrawer({
  live,
  groups,
  activeConversationId,
  selectedDemoId,
  onSelectDemo,
  onClose,
}: {
  live: boolean;
  groups: ArcThreadGroupVM[];
  activeConversationId: string | null;
  selectedDemoId: string;
  onSelectDemo: (id: string) => void;
  onClose: () => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [demoGroups, setDemoGroups] = useState<ArcThreadGroupVM[]>(DEMO_THREADS);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const sourceGroups = live ? groups : demoGroups;
  const visibleGroups = filterThreadGroups(sourceGroups, query);

  // Demo mutations are local; live mutations hit the real actions then refresh.
  const applyDemo = (id: string, transform: (item: ThreadItem) => ThreadItem | null) => {
    setDemoGroups((prev) => prev
      .map((group) => ({ ...group, items: group.items.flatMap((item) => {
        if (item.id !== id) return [item];
        const next = transform(item as ThreadItem);
        return next ? [next as (typeof group.items)[number]] : [];
      }) }))
      .filter((group) => group.items.length > 0));
  };

  const doRename = (id: string, title: string) => {
    if (!live) return applyDemo(id, (item) => ({ ...item, title }));
    renameArcConversationAction({ conversationId: id, title }).then((result) => { if (result.ok) router.refresh(); });
  };
  const doPin = (id: string, pinned: boolean) => {
    if (!live) return applyDemo(id, (item) => ({ ...item, pinned }));
    pinArcConversationAction({ conversationId: id, pinned }).then((result) => { if (result.ok) router.refresh(); });
  };
  const doArchive = (id: string) => {
    if (!live) return applyDemo(id, () => null);
    archiveArcConversationAction(id).then((result) => { if (result.ok) router.refresh(); });
  };
  const doDelete = (id: string) => {
    if (!live) return applyDemo(id, () => null);
    deleteArcConversationAction(id).then((result) => {
      if (!result.ok) return;
      if (id === activeConversationId) router.push("/arc?new=1");
      else router.refresh();
    });
  };

  useEffect(() => {
    const focusSearch = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLocaleLowerCase() === "k") {
        event.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", focusSearch);
    return () => window.removeEventListener("keydown", focusSearch);
  }, []);

  return (
    <motion.aside className="arc-history" initial={{ x: -24, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -24, opacity: 0 }} transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }} aria-label="Conversation history">
      <div className="arc-history-head"><div><h2>Conversations</h2><p>Pick up where you left off.</p></div><button type="button" className="arc-icon-button" onClick={onClose} aria-label="Close history"><X size={17} /></button></div>
      {live ? <Link href="/arc?new=1" className="arc-new-chat"><Plus size={16} /> New conversation</Link> : <button type="button" className="arc-new-chat" onClick={() => onSelectDemo("new")}><Plus size={16} /> New conversation</button>}
      <label className="arc-history-search"><Search size={15} /><input ref={searchInputRef} autoFocus type="search" aria-label="Search conversations" placeholder="Search conversations" value={query} onChange={(event) => setQuery(event.target.value)} /><kbd aria-hidden="true">⌘K</kbd></label>
      <div className="arc-history-list">
        {visibleGroups.map((group) => (
          <div className="arc-history-group" key={group.group}>
            <h3>{group.group}</h3>
            {group.items.map((thread) => {
              const active = live ? thread.id === activeConversationId : thread.id === selectedDemoId;
              return (
                <ThreadRow
                  key={thread.id}
                  thread={thread}
                  active={active}
                  live={live}
                  onOpen={live ? onClose : () => onSelectDemo(thread.id)}
                  onRename={(title) => doRename(thread.id, title)}
                  onPin={(pinned) => doPin(thread.id, pinned)}
                  onArchive={() => doArchive(thread.id)}
                  onDelete={() => doDelete(thread.id)}
                />
              );
            })}
          </div>
        ))}
        {visibleGroups.length === 0 ? <div className="arc-history-empty"><Search size={17} /><b>No conversations found</b><span>Try a different title or date.</span></div> : null}
      </div>
    </motion.aside>
  );
}

function ShareDialog({ conversationId, onClose }: { conversationId: string | null; onClose: () => void }) {
  const [state, setState] = useState<ChatSharingState | null>(null);
  const [visibility, setVisibility] = useState<ShareVisibility>("private");
  const [permission, setPermission] = useState<SharePermission>("view");
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const reload = useCallback(() => {
    if (!conversationId) return;
    getChatSharingStateAction(conversationId).then((next) => {
      setState(next);
      setVisibility(next.visibility);
      setPermission(next.workspacePermission);
    });
  }, [conversationId]);
  useEffect(() => { reload(); }, [reload]);

  const save = () => conversationId && start(async () => {
    const result = await setChatSharingAction({ conversationId, visibility, workspacePermission: permission });
    setNotice(result.ok ? "Sharing updated" : result.error);
  });
  const add = (userId: string, nextPermission: SharePermission) => conversationId && start(async () => {
    await shareChatWithMemberAction({ conversationId, userId, permission: nextPermission });
    reload();
  });
  const remove = (userId: string) => conversationId && start(async () => {
    await unshareChatMemberAction({ conversationId, userId });
    reload();
  });

  return (
    <motion.div className="arc-modal-scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} role="presentation">
      <motion.div className="arc-share-dialog" initial={{ opacity: 0, y: 12, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8, scale: 0.99 }} role="dialog" aria-modal="true" aria-labelledby="arc-share-title" onClick={(event) => event.stopPropagation()}>
        <div className="arc-share-head"><div><h2 id="arc-share-title">Share conversation</h2><p>Private by default. Choose who can view or collaborate.</p></div><button type="button" className="arc-icon-button" onClick={onClose} aria-label="Close share dialog"><X size={17} /></button></div>
        {!conversationId ? <p className="arc-share-empty">Start a real conversation before sharing it.</p> : null}
        <fieldset disabled={busy || !conversationId}><legend>Who can access</legend><div className="arc-segment"><button type="button" className={visibility === "private" ? "is-active" : ""} onClick={() => setVisibility("private")}>Private</button><button type="button" className={visibility === "workspace" ? "is-active" : ""} onClick={() => setVisibility("workspace")}>Workspace</button></div></fieldset>
        {visibility === "workspace" ? <fieldset disabled={busy || !conversationId}><legend>Workspace permission</legend><div className="arc-segment"><button type="button" className={permission === "view" ? "is-active" : ""} onClick={() => setPermission("view")}>Can view</button><button type="button" className={permission === "collaborate" ? "is-active" : ""} onClick={() => setPermission("collaborate")}>Can collaborate</button></div></fieldset> : null}
        <button type="button" className="arc-primary-button" onClick={save} disabled={busy || !conversationId}>{busy ? "Saving…" : "Save access"}</button>
        <div className="arc-share-people"><h3>People with access</h3>{state?.shared.length ? state.shared.map((member) => <div key={member.userId}><span><Users size={15} /><b>{member.email ?? member.userId}</b><small>{member.permission}</small></span><button type="button" onClick={() => remove(member.userId)}>Remove</button></div>) : <p>No one has been added yet.</p>}{state?.addable.slice(0, 3).map((member) => <div key={member.userId}><span><Users size={15} /><b>{member.email ?? member.userId}</b></span><button type="button" onClick={() => add(member.userId, "view")}>Add</button></div>)}</div>
        {notice ? <p className="arc-share-notice">{notice}</p> : null}
      </motion.div>
    </motion.div>
  );
}

export function ArcView({
  brandName,
  operatorName,
  live = false,
  threadGroups = [],
  messages = [],
  activeConversationId = null,
  mentionGroups = [],
  waiting = null,
  initialDraft,
}: {
  brandName: string;
  operatorName?: string;
  live?: boolean;
  threadGroups?: ArcThreadGroupVM[];
  messages?: ArcMessage[];
  activeConversationId?: string | null;
  mentionGroups?: MentionGroup[];
  waiting?: ArcWaiting | null;
  initialDraft?: string;
}) {
  // Prefer the operator's first name for the greeting; fall back to the brand in
  // open/demo mode where there's no signed-in person.
  const greetName = operatorName?.trim() || brandName?.trim() || "there";
  const router = useRouter();
  const [isSending, startSend] = useTransition();
  const [draft, setDraft] = useState(initialDraft ?? "");
  const [mode, setMode] = useState<ArcMode>("ask");
  const [modelPreference, setModelPreference] = useState<ArcModelPreference>("auto");
  const [route, setRoute] = useState<ArcRoute>("fast");
  const [composerMenu, setComposerMenu] = useState<ComposerMenu>(null);
  const [selectedMentions, setSelectedMentions] = useState<ArcMention[]>([]);
  const [attachments, setAttachments] = useState<ArcAttachment[]>([]);
  const [command, setCommand] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [composerNotice, setComposerNotice] = useState<string | null>(null);
  const [contextInfoOpen, setContextInfoOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [workPanelOpen, setWorkPanelOpen] = useState(false);
  // The assets open in the review workspace (null = closed), plus a per-asset
  // decision map so approvals persist while the panel is open and reflect back on
  // the inline package summary.
  const [reviewCards, setReviewCards] = useState<ArcActionCard[] | null>(null);
  const [assetStatuses, setAssetStatuses] = useState<Record<string, ArcAssetStatus>>({});
  const [selectedDemoId, setSelectedDemoId] = useState("storm");
  const [dismissedQuestionId, setDismissedQuestionId] = useState<string | null>(null);
  const [demoTurns, setDemoTurns] = useState<DemoTurn[]>([]);
  const [demoPending, setDemoPending] = useState(false);
  const [stoppingTaskId, setStoppingTaskId] = useState<string | null>(null);
  const demoTimer = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const composerMenuRef = useRef<HTMLDivElement | null>(null);
  const composerMenuTriggerRef = useRef<HTMLButtonElement | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLElement | null>(null);
  const pinnedRef = useRef(true);
  const [showJump, setShowJump] = useState(false);
  // Live reply pushed over SSE (body/reasoning/steps as they land), overlaid onto
  // the pending message for instant streaming without a full server refetch.
  const [streamOverlay, setStreamOverlay] = useState<{ id: string; body: string; reasoning: string | null; steps: ArcStep[] } | null>(null);
  const awaitingReply = live && messages.some((message) => message.status === "pending" || (message.role === "arc" && !message.body.trim()));
  const isStreaming = awaitingReply || demoPending;
  const turnCount = live ? messages.length : demoTurns.length;

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("arc.workPanelOpen");
      if (window.matchMedia("(min-width: 1180px)").matches && saved !== "0") {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- restored after hydration so server and client markup stay identical
        setWorkPanelOpen(true);
      }
    } catch {
      /* localStorage unavailable — leave the panel closed */
    }
  }, []);

  // Default to "instant": the scroll container sets `scroll-behavior: smooth`, so
  // an animated follow would restart a new tween every tick toward a moving
  // bottom and never arrive. Only the explicit jump pill animates.
  const scrollToEnd = useCallback((behavior: ScrollBehavior = "instant") => {
    // Defer a frame so we measure after new content (a fresh turn, a streamed
    // line, a card) has laid out — otherwise we under-scroll and appear stuck.
    requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (el) el.scrollTo({ top: el.scrollHeight, behavior });
    });
  }, []);

  // Subscribe to the live reply over SSE while one is in flight — pushes the
  // growing body/reasoning/steps as they land (no interval polling), then a `done`
  // event triggers a single refetch of the canonical message. The overlay is
  // cleared on teardown, so a completed reply always renders from server state.
  useEffect(() => {
    if (!live || !awaitingReply || !activeConversationId) return;
    const source = new EventSource(`/api/arc/stream/${encodeURIComponent(activeConversationId)}`);
    source.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as { messageId: string; body?: string; reasoning?: string | null; steps?: ArcStep[] };
        if (!data.messageId) return;
        setStreamOverlay({
          id: data.messageId,
          body: data.body ?? "",
          reasoning: data.reasoning ?? null,
          steps: Array.isArray(data.steps) ? data.steps : [],
        });
      } catch {
        /* ignore a malformed frame */
      }
    };
    source.addEventListener("done", () => {
      source.close();
      router.refresh(); // pull the final message (body + actions / recall / suggestions)
    });
    // On a transient drop EventSource reconnects on its own; the backstop below
    // covers a hard failure so the bubble can never hang.
    return () => {
      source.close();
      setStreamOverlay(null);
    };
  }, [live, awaitingReply, activeConversationId, router]);

  // Backstop: reconcile with the server on a slow cadence while awaiting, so a
  // blocked or proxy-buffered SSE stream still resolves. Defense in depth, not the
  // primary path — the SSE stream above carries the live updates.
  useEffect(() => {
    if (!awaitingReply) return;
    const startedAt = Date.now();
    const interval = window.setInterval(() => {
      if (Date.now() - startedAt > 120_000) return window.clearInterval(interval);
      router.refresh();
    }, 6000);
    return () => window.clearInterval(interval);
  }, [awaitingReply, router]);

  // Track whether the reader is pinned to the bottom, so we only auto-follow the
  // stream when they haven't scrolled up to read. We unpin on a genuine USER
  // scroll-up (wheel / touch), not on the `scroll` event — streamed content and
  // the row animations fire scroll events constantly, and reading those as intent
  // would unpin us mid-stream. We re-pin when the user returns near the bottom.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    // Tight threshold so a deliberate scroll-up reliably breaks the follow (and
    // isn't immediately re-pinned) — you re-pin only by returning to the bottom.
    const nearBottom = () => el.scrollHeight - el.scrollTop - el.clientHeight < 48;
    const unpin = () => {
      if (pinnedRef.current) {
        pinnedRef.current = false;
        setShowJump(true);
      }
    };
    const onWheel = (event: WheelEvent) => { if (event.deltaY < 0) unpin(); };
    let touchY = 0;
    const onTouchStart = (event: TouchEvent) => { touchY = event.touches[0]?.clientY ?? 0; };
    const onTouchMove = (event: TouchEvent) => {
      const y = event.touches[0]?.clientY ?? 0;
      if (y - touchY > 6) unpin();
      touchY = y;
    };
    const onScroll = () => {
      if (nearBottom()) {
        pinnedRef.current = true;
        setShowJump(false); // no-op re-render when already hidden
      }
    };
    el.addEventListener("wheel", onWheel, { passive: true });
    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: true });
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("scroll", onScroll);
    };
  }, []);

  // Follow the answer as it types out — but only while pinned, so a reader who
  // scrolled up to re-read isn't yanked back down.
  useEffect(() => {
    if (!isStreaming) return;
    const interval = window.setInterval(() => {
      if (pinnedRef.current) scrollToEnd();
    }, 120);
    return () => window.clearInterval(interval);
  }, [isStreaming, scrollToEnd]);

  // A new turn (yours or Arc's) re-pins and jumps to the latest. Scrolling to the
  // bottom fires onScroll, which clears the jump pill — so we don't setState here.
  useEffect(() => {
    if (turnCount === 0) return;
    pinnedRef.current = true;
    scrollToEnd();
  }, [turnCount, scrollToEnd]);

  // Opening or switching conversations should resume at the latest turn. This
  // is separate from turnCount because the seeded demo thread has no local turns.
  useEffect(() => {
    pinnedRef.current = true;
    // An empty conversation shows the launcher — its greeting is the moment that
    // makes opening Arc feel personal, so rest at the top instead of auto-scrolling
    // down to the composer and hiding it. Once a turn exists (or a run is in
    // flight) we resume at the latest message.
    if (turnCount === 0 && !isStreaming) {
      window.requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({ top: 0, behavior: "instant" });
      });
      return;
    }
    scrollToEnd();
  }, [activeConversationId, live, selectedDemoId, turnCount, isStreaming, scrollToEnd]);

  useEffect(() => () => {
    if (demoTimer.current != null) window.clearTimeout(demoTimer.current);
  }, []);

  useEffect(() => {
    if (!composerMenu || !composerMenuTriggerRef.current) return;
    const frame = window.requestAnimationFrame(() => {
      composerMenuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"]')?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [composerMenu]);

  useEffect(() => {
    if (!composerMenu && !reviewCards && !contextInfoOpen) return;

    const dismissOpenSurface = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      if (composerMenu && !target.closest(".arc-composer-menu") && !target.closest('[aria-controls="arc-composer-menu"]')) {
        setComposerMenu(null);
      }

      if (contextInfoOpen && !target.closest(".arc-context-control")) {
        setContextInfoOpen(false);
      }

      if (reviewCards && !target.closest(".arc-artifact-workspace") && !target.closest('[data-arc-review-trigger="true"]')) {
        setReviewCards(null);
      }
    };

    document.addEventListener("pointerdown", dismissOpenSurface);
    return () => document.removeEventListener("pointerdown", dismissOpenSurface);
  }, [composerMenu, contextInfoOpen, reviewCards]);

  const activeThread = threadGroups.flatMap((group) => group.items).find((thread) => thread.id === activeConversationId);
  const selectedDemoThread = DEMO_THREADS.flatMap((group) => group.items).find((thread) => thread.id === selectedDemoId);
  const header = getArcConversationHeader({
    live,
    activeTitle: activeThread?.title,
    selectedDemoId,
    selectedDemoTitle: selectedDemoThread?.title,
  });
  const latestQuestion = live ? [...messages].reverse().find((message) => message.role === "arc")?.questions?.[0] ?? null : null;
  const visibleQuestion = latestQuestion && latestQuestion.id !== dismissedQuestionId ? latestQuestion : null;
  // Real usage measured from the conversation's own turns — an empty chat reads
  // 0%, not a fabricated baseline. Mirrors the runner's working-history window.
  const contextState = contextUsage(messages.map((message) => message.body ?? ""));
  const mentionItems = mentionGroups.flatMap((group) => group.items.map((item) => ({ ...item, group: group.label }))).slice(0, 12);
  const currentModel = MODEL_OPTIONS.find((option) => option.id === modelPreference) ?? MODEL_OPTIONS[0];
  const resolvedModelName = route === "fast" ? "Spark" : "Forge";
  const showDemoLauncher = shouldShowDemoLauncher({ selectedDemoId, turnCount: demoTurns.length, pending: demoPending });
  const contextScopes = ARC_CONTEXT_SCOPES;

  const updateDraft = (value: string) => {
    setDraft(value);
    setMode(inferComposerMode(value, command));
    if (modelPreference === "auto") {
      setRoute(resolveArcModelRoute({ preference: modelPreference, request: value, command }));
    }
  };

  const closeComposerMenu = (restoreFocus = false) => {
    setComposerMenu(null);
    if (restoreFocus) window.requestAnimationFrame(() => composerMenuTriggerRef.current?.focus());
  };

  const toggleComposerMenu = (menu: Exclude<ComposerMenu, null>, trigger: HTMLButtonElement) => {
    composerMenuTriggerRef.current = trigger;
    setContextInfoOpen(false);
    setComposerMenu((current) => current === menu ? null : menu);
    setComposerNotice(null);
  };

  const handleComposerMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"]')).filter((item) => !item.disabled);
    if (event.key === "Escape") {
      event.preventDefault();
      closeComposerMenu(true);
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      const activeItem = document.activeElement as HTMLButtonElement | null;
      if (activeItem && items.includes(activeItem)) {
        event.preventDefault();
        activeItem.click();
      }
      return;
    }
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key) || items.length === 0) return;
    event.preventDefault();
    const currentIndex = items.indexOf(document.activeElement as HTMLButtonElement);
    const nextIndex = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : event.key === "ArrowDown" ? (currentIndex + 1 + items.length) % items.length : (currentIndex - 1 + items.length) % items.length;
    items[nextIndex]?.focus();
  };

  const chooseMention = (mention: ArcMention) => {
    setSelectedMentions((current) => current.some((item) => item.type === mention.type && item.id === mention.id) ? current : [...current, mention]);
    setDraft((current) => current.replace(/@\s*$/, ""));
    closeComposerMenu(true);
  };

  const chooseCommand = (nextCommand: (typeof COMMAND_OPTIONS)[number]) => {
    setCommand(nextCommand.id);
    setMode(nextCommand.mode);
    if (modelPreference === "auto") {
      setRoute(resolveArcModelRoute({ preference: modelPreference, request: draft, command: nextCommand.id }));
    }
    setDraft((current) => current.replace(/^\s*\/\s*$/, ""));
    closeComposerMenu(true);
  };

  const chooseModel = (preference: ArcModelPreference) => {
    setModelPreference(preference);
    setRoute(resolveArcModelRoute({ preference, request: draft, command }));
    closeComposerMenu(true);
  };

  const handleAttachmentFiles = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (files.length === 0) return;
    setComposerMenu(null);
    setComposerNotice(null);

    if (!live) {
      setAttachments((current) => [
        ...current,
        ...files.map((file, index) => ({
          url: `demo://attachment/${Date.now()}-${index}`,
          objectPath: `demo/${file.name}`,
          contentType: file.type || "application/octet-stream",
          name: file.name,
        })),
      ]);
      return;
    }

    setUploading(true);
    const results = await Promise.all(files.map(async (file) => {
      const formData = new FormData();
      formData.append("file", file);
      return uploadArcAttachmentAction(formData);
    }));
    const uploaded = results.flatMap((result) => result.ok ? [result.attachment] : []);
    const firstError = results.find((result) => !result.ok);
    if (uploaded.length > 0) setAttachments((current) => [...current, ...uploaded]);
    setComposerNotice(firstError && !firstError.ok ? firstError.error : `${uploaded.length} file${uploaded.length === 1 ? "" : "s"} attached`);
    setUploading(false);
  };

  const submitDraft = () => {
    const body = draft.trim();
    if (!body || isSending || demoPending || uploading) return;
    const resolvedMode = inferComposerMode(body, command);
    const resolvedRoute = resolveArcModelRoute({ preference: modelPreference, request: body, command });
    setMode(resolvedMode);
    setRoute(resolvedRoute);
    setComposerMenu(null);
    setContextInfoOpen(false);
    setComposerNotice(null);
    if (!live) {
      const demoContract = buildArcRunContract({ mode: resolvedMode, route: resolvedRoute, contextScopes });
      const demoProfile = buildArcRunProfile({ request: body, mode: resolvedMode, command, sources: demoContract.readScopes });
      const operatorTurn: DemoTurn = { id: `operator-${Date.now()}`, role: "operator", body, mode: resolvedMode, command };
      setDemoTurns((current) => [...current, operatorTurn]);
      setDraft("");
      setSelectedMentions([]);
      setAttachments([]);
      setCommand(null);
      setDemoPending(true);
      demoTimer.current = window.setTimeout(() => {
        setDemoPending(false);
        setDemoTurns((current) => [...current, {
          id: `arc-${Date.now()}`,
          role: "arc",
          body: demoProfile.completedSummary,
          mode: resolvedMode,
          command,
        }]);
      }, 6000);
      return;
    }
    startSend(async () => {
      const result = await sendArcMessageAction({
        conversationId: activeConversationId,
        body,
        mentions: selectedMentions,
        attachments,
        mode: resolvedMode,
        route: resolvedRoute,
        command,
        contextScopes,
      });
      if (!result.ok) {
        setComposerNotice(result.error);
        return;
      }
      setDraft("");
      setSelectedMentions([]);
      setAttachments([]);
      setCommand(null);
      router.push(`/arc?c=${result.conversationId}`);
      router.refresh();
    });
  };

  const selectDemoThread = (id: string) => {
    setSelectedDemoId(id);
    setHistoryOpen(false);
    setReviewCards(null);
    setContextInfoOpen(false);
    setDemoTurns([]);
    setDemoPending(false);
  };

  const openReview = (cards: ArcActionCard[]) => {
    setComposerMenu(null);
    setContextInfoOpen(false);
    setWorkPanelOpen(true);
    setReviewCards(cards.filter((card) => card.approval));
  };

  const setWorkPanelVisibility = (open: boolean) => {
    setWorkPanelOpen(open);
    if (!open) setReviewCards(null);
    try {
      window.localStorage.setItem("arc.workPanelOpen", open ? "1" : "0");
    } catch {
      /* localStorage unavailable — the in-session state still works */
    }
  };

  const recordAssetStatus = (assetId: string, status: ArcAssetStatus) => {
    setAssetStatuses((current) => ({ ...current, [assetId]: status }));
  };

  const stopDemoRun = () => {
    if (demoTimer.current != null) window.clearTimeout(demoTimer.current);
    demoTimer.current = null;
    setDemoPending(false);
    setDemoTurns((current) => {
      const latestOperator = [...current].reverse().find((turn) => turn.role === "operator");
      return [...current, {
        id: `arc-stopped-${Date.now()}`,
        role: "arc",
        outcome: "canceled",
        body: "Stopped. No remaining work was applied, and nothing was sent.",
        mode: latestOperator?.mode,
        command: latestOperator?.command,
      }];
    });
    setComposerNotice("Run stopped. Its receipt is preserved in this conversation.");
  };

  const stopLiveRun = async (taskId: string, conversationId: string) => {
    if (stoppingTaskId) return;
    setStoppingTaskId(taskId);
    setComposerNotice(null);
    const result = await cancelArcRunAction({ taskId, conversationId });
    setStoppingTaskId(null);
    setComposerNotice(result.ok ? "Run stopped. Its receipt remains in the conversation." : result.error);
    router.refresh();
  };

  const handleEditResend = (messageId: string, newBody: string) => {
    setComposerNotice(null);
    startSend(async () => {
      const result = await editAndResendArcMessageAction({ messageId, body: newBody });
      if (!result.ok) return setComposerNotice(result.error);
      router.refresh();
    });
  };

  const handleRegenerate = (replyMessageId: string) => {
    setComposerNotice(null);
    startSend(async () => {
      const result = await regenerateArcReplyAction(replyMessageId);
      if (!result.ok) return setComposerNotice(result.error);
      router.refresh();
    });
  };

  // Demo-only: simulate edit-and-resend by re-running the edited turn locally.
  const demoEditResend = (body: string) => {
    if (demoPending) return;
    const resolvedMode = inferComposerMode(body, command);
    const resolvedRoute = resolveArcModelRoute({ preference: modelPreference, request: body, command });
    setRoute(resolvedRoute);
    const profile = buildArcRunProfile({ request: body, mode: resolvedMode, command, sources: buildArcRunContract({ mode: resolvedMode, route: resolvedRoute, contextScopes }).readScopes });
    setDemoTurns((current) => [...current, { id: `operator-edit-${Date.now()}`, role: "operator", body, mode: resolvedMode, command }]);
    setDemoPending(true);
    demoTimer.current = window.setTimeout(() => {
      setDemoPending(false);
      setDemoTurns((current) => [...current, { id: `arc-edit-${Date.now()}`, role: "arc", body: profile.completedSummary, mode: resolvedMode, command }]);
    }, 4500);
  };

  // Overlay the SSE-streamed body/reasoning/steps onto the in-flight message, so
  // it types out live. Applied ONLY while that message is still pending — once the
  // server marks it complete, the canonical message (with its structured extras)
  // wins and the overlay is ignored.
  const renderedMessages = streamOverlay
    ? messages.map((message) =>
        message.id === streamOverlay.id && (message.status === "pending" || (message.role === "arc" && !message.body.trim()))
          ? {
              ...message,
              body: streamOverlay.body || message.body,
              reasoning: streamOverlay.reasoning ?? message.reasoning,
              steps: streamOverlay.steps.length ? streamOverlay.steps : message.steps,
            }
          : message,
      )
    : messages;
  const latestArcMessage = [...renderedMessages].reverse().find((message) => message.role === "arc");
  const latestDemoRequest = [...demoTurns].reverse().find((turn) => turn.role === "operator")?.body;
  const demoSeed = !live && selectedDemoId !== "new";
  const workCards = live ? latestArcMessage?.actions ?? [] : demoSeed ? DEMO_PACKAGE_CARDS : [];
  const panelVisible = workPanelOpen || Boolean(reviewCards?.length);

  return (
    <div className="arc-chat" data-workspace-open={panelVisible ? "true" : "false"}>
      <header className="arc-conversation-header">
        <button type="button" className="arc-history-button" onClick={() => setHistoryOpen(true)} aria-label="Open conversation history"><Menu size={17} /><span>History</span></button>
        <div className="arc-conversation-title"><h1>{header.title}</h1><p>{header.subtitle}</p></div>
        <div className="arc-conversation-actions">
          <button type="button" onClick={() => setShareOpen(true)} disabled={!activeConversationId} title={!activeConversationId ? "Start a real conversation before sharing" : "Share conversation"}><Share2 size={15} /> Share</button>
          <button type="button" className="arc-header-work" aria-expanded={panelVisible} aria-label={panelVisible ? "Close conversation workspace" : "Open conversation workspace"} onClick={() => setWorkPanelVisibility(!panelVisible)}>{panelVisible ? <PanelRightClose size={15} /> : <PanelRightOpen size={15} />}<span>Workspace</span></button>
        </div>
      </header>

      <main className="arc-conversation-scroll" ref={scrollRef}>
        <div className="arc-conversation-column">
          {live ? <LiveConversation messages={renderedMessages} operatorName={greetName} waiting={waiting} assetStatuses={assetStatuses} onSuggestion={updateDraft} onReview={openReview} onEdit={handleEditResend} onRegenerate={handleRegenerate} onCancelRun={stopLiveRun} stoppingTaskId={stoppingTaskId} /> : showDemoLauncher ? <ArcLauncher greetName={greetName} waiting={DEMO_WAITING} onPick={updateDraft} /> : <DemoConversation turns={demoTurns} pending={demoPending} includeSeed={selectedDemoId !== "new"} packageStatuses={assetStatuses} pendingContract={buildArcRunContract({ mode, route, contextScopes, agentTaskId: "DEMO-RUNNING" })} onReview={openReview} onEditResend={demoEditResend} onStop={stopDemoRun} />}
          <div ref={endRef} />
        </div>
      </main>

      <footer className="arc-composer-dock">
        <div className="arc-composer-column">
          <AnimatePresence>
            {showJump ? (
              <motion.button
                type="button"
                className="arc-jump"
                onClick={() => { pinnedRef.current = true; setShowJump(false); scrollToEnd("smooth"); }}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 6 }}
                transition={{ duration: 0.16 }}
                aria-label="Jump to latest message"
              >
                <ChevronDown size={15} /> Latest
              </motion.button>
            ) : null}
          </AnimatePresence>
          {visibleQuestion ? <QuestionPrompt question={visibleQuestion} onChoose={(value) => { updateDraft(value); setDismissedQuestionId(visibleQuestion.id); }} onDismiss={() => setDismissedQuestionId(visibleQuestion.id)} /> : null}
          <div className="arc-composer" data-busy={isSending || demoPending ? "true" : "false"}>
            <input ref={fileInputRef} type="file" hidden multiple accept="image/png,image/jpeg,image/gif,image/webp,application/pdf,text/plain,text/markdown,text/csv" onChange={handleAttachmentFiles} />

            <AnimatePresence>
              {composerMenu ? (
                <motion.div ref={composerMenuRef} id="arc-composer-menu" className="arc-composer-menu" data-menu={composerMenu} role="menu" aria-label={`${composerMenu} menu`} onKeyDown={handleComposerMenuKeyDown} initial={{ opacity: 0, y: 7, scale: 0.985 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 5, scale: 0.99 }} transition={{ duration: 0.16 }}>
                  {composerMenu === "tools" ? (
                    <>
                      <div className="arc-composer-menu-head"><b>Add to this message</b><button type="button" onClick={() => closeComposerMenu(true)} aria-label="Close message tools"><X size={14} /></button></div>
                      <button type="button" role="menuitem" onClick={() => { closeComposerMenu(); fileInputRef.current?.click(); }}><Paperclip size={16} /><span><b>Upload a file</b><small>Images, PDFs, text, Markdown, or CSV</small></span></button>
                      <button type="button" role="menuitem" onClick={() => setComposerMenu("mentions")}><AtSign size={16} /><span><b>Mention workspace item</b><small>Campaigns, contacts, properties, and more</small></span></button>
                      <button type="button" role="menuitem" onClick={() => setComposerMenu("commands")}><Slash size={16} /><span><b>Use a command</b><small>Start a structured Arc workflow</small></span></button>
                    </>
                  ) : null}

                  {composerMenu === "model" ? (
                    <>
                      <div className="arc-model-menu-label">Model</div>
                      <div className="arc-model-options">
                        {MODEL_OPTIONS.map((option) => <button type="button" className="arc-model-option" data-model={option.id} role="menuitemradio" aria-checked={modelPreference === option.id} key={option.id} onClick={() => chooseModel(option.id)}><i className="arc-model-symbol" aria-hidden="true"><ArcModelIcon model={option.id} size={16} /></i><span><b>{option.label}</b><small>{option.description}</small></span><i className="arc-model-check" aria-hidden="true">{modelPreference === option.id ? <Check size={14} /> : null}</i></button>)}
                      </div>
                    </>
                  ) : null}

                  {composerMenu === "mentions" ? (
                    <>
                      <div className="arc-composer-menu-head"><b>Mention</b><small>Pin a workspace item to this turn</small></div>
                      {mentionItems.length > 0 ? mentionItems.map((mention) => <button type="button" role="menuitem" key={`${mention.type}-${mention.id}`} onClick={() => chooseMention(mention)}><AtSign size={16} /><span><b>{mention.label}</b><small>{mention.group}</small></span></button>) : <div className="arc-composer-menu-empty">No workspace items are available yet.</div>}
                    </>
                  ) : null}

                  {composerMenu === "commands" ? (
                    <>
                      <div className="arc-composer-menu-head"><b>Commands</b><small>Start a focused workflow</small></div>
                      {COMMAND_OPTIONS.map((option) => <button type="button" role="menuitem" key={option.id} onClick={() => chooseCommand(option)}><Slash size={16} /><span><b>/{option.id}</b><small>{option.description}</small></span></button>)}
                    </>
                  ) : null}
                </motion.div>
              ) : null}
            </AnimatePresence>

            {selectedMentions.length > 0 || attachments.length > 0 || command || composerNotice ? (
              <div className="arc-composer-chips">
                {command ? <span className="arc-composer-chip is-command"><Slash size={12} />{command}<button type="button" onClick={() => { setCommand(null); setMode(inferComposerMode(draft, null)); }} aria-label={`Remove ${command} command`}><X size={11} /></button></span> : null}
                {selectedMentions.map((mention) => <span className="arc-composer-chip" key={`${mention.type}-${mention.id}`}><AtSign size={12} />{mention.label}<button type="button" onClick={() => setSelectedMentions((current) => current.filter((item) => !(item.type === mention.type && item.id === mention.id)))} aria-label={`Remove ${mention.label}`}><X size={11} /></button></span>)}
                {attachments.map((attachment) => <span className={`arc-composer-chip${attachment.contentType.startsWith("image/") ? " has-thumb" : ""}`} key={attachment.objectPath}>{attachment.contentType.startsWith("image/") ? <ChipThumb url={attachment.url} /> : <Paperclip size={12} />}{attachment.name}<button type="button" onClick={() => setAttachments((current) => current.filter((item) => item.objectPath !== attachment.objectPath))} aria-label={`Remove ${attachment.name}`}><X size={11} /></button></span>)}
                {composerNotice ? <span className="arc-composer-notice">{composerNotice}</span> : null}
              </div>
            ) : null}

            <textarea aria-label="Message Arc" placeholder={command ? `Tell Arc what to do with /${command}…` : "Message Arc…"} value={draft} rows={2} disabled={isSending || demoPending} onChange={(event) => { const value = event.target.value; updateDraft(value); if (value.endsWith("@")) { composerMenuTriggerRef.current = null; setComposerMenu("mentions"); } else if (value.trim() === "/") { composerMenuTriggerRef.current = null; setComposerMenu("commands"); } }} onKeyDown={(event) => { if (event.key === "Escape") closeComposerMenu(); if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); submitDraft(); } }} />
            <div className="arc-composer-toolbar">
              <div className="arc-composer-tools">
                <button type="button" className="arc-composer-add" aria-label="Add attachment, mention, or command" aria-haspopup="menu" aria-controls={composerMenu === "tools" ? "arc-composer-menu" : undefined} aria-expanded={composerMenu === "tools"} onClick={(event) => toggleComposerMenu("tools", event.currentTarget)}><Plus size={18} /></button>
                <button type="button" className="arc-composer-pill arc-model-button" aria-label={`Model: ${currentModel.label}${modelPreference === "auto" ? `. Currently routes to Arc ${resolvedModelName}.` : ""}`} aria-haspopup="menu" aria-controls={composerMenu === "model" ? "arc-composer-menu" : undefined} aria-expanded={composerMenu === "model"} onClick={(event) => toggleComposerMenu("model", event.currentTarget)}><ArcModelIcon model={modelPreference} size={14} /><span>{currentModel.label}{modelPreference === "auto" ? <small> · {resolvedModelName}</small> : null}</span><ChevronDown size={12} /></button>
                <div className="arc-context-control">
                  <button type="button" className="arc-context-meter" data-level={contextState.level} aria-label={`Context window: ${contextState.pct}% used. Full workspace memory is always on.`} aria-expanded={contextInfoOpen} aria-controls="arc-context-info" onClick={() => { setComposerMenu(null); setContextInfoOpen((current) => !current); }} onKeyDown={(event) => { if (event.key === "Escape") setContextInfoOpen(false); }}>
                    <CircularProgress className="arc-context-progress" color="inherit" variant="determinate" value={contextState.pct} size={30} thickness={2.4} role="presentation" aria-hidden="true" />
                  </button>
                  <AnimatePresence>
                    {contextInfoOpen ? (
                      <motion.div id="arc-context-info" className="arc-context-popover" role="status" initial={{ opacity: 0, y: 5, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 4, scale: 0.99 }} transition={{ duration: 0.14 }}>
                        <b>Context</b>
                        <span>{contextState.pct}% used</span>
                        <p>Arc remembers your full workspace automatically.</p>
                      </motion.div>
                    ) : null}
                  </AnimatePresence>
                </div>
              </div>
              <div className="arc-composer-send"><button type="button" className="arc-send-button" onClick={submitDraft} disabled={!draft.trim() || isSending || demoPending || uploading} aria-label="Send message">{isSending || demoPending || uploading ? <LoaderCircle size={18} className="is-spinning" /> : <ArrowUp size={18} />}</button></div>
            </div>
          </div>
        </div>
      </footer>

      <AnimatePresence>
        {reviewCards && reviewCards.length > 0
          ? <AssetReviewPanel key="asset-review" cards={reviewCards} statuses={assetStatuses} onStatus={recordAssetStatus} onClose={() => setReviewCards(null)} />
          : workPanelOpen
            ? <ArcWorkPanel key="work-panel" message={latestArcMessage} cards={workCards} statuses={assetStatuses} demoSeed={demoSeed} demoPending={demoPending} demoRequest={latestDemoRequest} onReview={openReview} onClose={() => setWorkPanelVisibility(false)} />
            : null}
        {historyOpen ? <Fragment key="conversation-history"><motion.button type="button" className="arc-drawer-scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setHistoryOpen(false)} aria-label="Close conversation history" /><ThreadDrawer live={live} groups={threadGroups} activeConversationId={activeConversationId} selectedDemoId={selectedDemoId} onSelectDemo={selectDemoThread} onClose={() => setHistoryOpen(false)} /></Fragment> : null}
        {shareOpen ? <ShareDialog key="share-dialog" conversationId={activeConversationId} onClose={() => setShareOpen(false)} /> : null}
      </AnimatePresence>
    </div>
  );
}
