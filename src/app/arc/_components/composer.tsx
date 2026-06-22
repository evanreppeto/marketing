"use client";

import { useActionState, useEffect, useMemo, useRef, useState, type RefObject } from "react";

import { cx } from "@/app/_components/theme";
import type { ArcMention, ArcMode, ArcRoute } from "@/domain";
import { serializeMentions } from "@/domain";
import { matchSlash, SLASH_COMMANDS, type SlashCommand } from "./slash-commands";
import { AutocompleteMenu, MentionIcon, MENTION_TYPE_LABEL, SlashIcon, type MenuRow } from "./composer-menu";
import { ModelSelect } from "./model-select";
import type { ArcAttachment, ArcMessage, ArcProject } from "@/lib/arc-chat/persistence";
import type { MentionGroup } from "@/lib/arc-chat/mention-search";

import { createArcUploadUrlAction, moveConversationForm, sendArcMessageAction, type SendMessageState } from "../actions";

function tempMessage(conversationId: string, body: string, mentions: ArcMention[], attachments: ArcAttachment[]): ArcMessage {
  return {
    id: `temp-${Date.now()}`,
    conversationId,
    role: "operator",
    body,
    status: "sent",
    agentTaskId: null,
    mentions,
    media: [],
    steps: [],
    feedback: null,
    actions: [],
    suggestions: [],
    attachments,
    createdAt: new Date().toISOString(),
  };
}

function SendIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 16V5" />
      <path d="M5 10l5-5 5 5" />
    </svg>
  );
}

function Spinner() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 motion-safe:animate-spin" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity="0.25" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

type PillOption<T extends string> = { id: T; label: string; hint: string; icon: React.ReactNode };

/** Shared 14px line glyph so every pill/menu icon matches the footer's stroke weight. */
function Glyph({ children }: { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}

const MODE_OPTIONS: PillOption<ArcMode>[] = [
  // Act = checkmark (decisive), Ask = speech bubble (answer only), Draft = pencil.
  { id: "act", label: "Act", hint: "Do the work — create approval-ready records", icon: <Glyph><path d="M4 10.5l3.5 3.5L16 5.5" /></Glyph> },
  { id: "ask", label: "Ask", hint: "Answer only — produce no work", icon: <Glyph><path d="M4 5.5h12v7H8l-3 2.5V12.5H4z" /></Glyph> },
  { id: "draft", label: "Draft", hint: "Draft content for your review", icon: <Glyph><path d="M4 13.5V16h2.5l8-8L12 5.5l-8 8z" /><path d="M11 6.5l2.5 2.5" /></Glyph> },
];
/** Footer pill with a labelled dropdown - used for the per-message mode route
 *  selectors. Manages its own open state and outside-click/Escape dismissal. */
function PillSelect<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: T;
  options: PillOption<T>[];
  onChange: (value: T) => void;
  ariaLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  const current = options.find((o) => o.id === value) ?? options[0];
  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${ariaLabel}: ${current.label}`}
        title={current.hint}
        className={cx(
          "flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition",
          open
            ? "bg-[var(--surface-inset)] text-[var(--text-primary)]"
            : "text-[var(--text-secondary)] hover:bg-[var(--surface-inset)] hover:text-[var(--text-primary)]",
        )}
      >
        <span key={current.id} className="pill-glyph-swap flex">{current.icon}</span>
        {current.label}
        <svg viewBox="0 0 20 20" aria-hidden className="h-3 w-3 text-[var(--text-muted)]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="m6 8 4 4 4-4" />
        </svg>
      </button>
      {open ? (
        <div role="menu" className="absolute bottom-full left-0 z-20 mb-1.5 w-56 overflow-y-auto rounded-xl border border-[var(--border-panel)] bg-[var(--surface-raised)] p-1.5 shadow-[var(--elev-raised)]">
          {options.map((o) => (
            <button
              key={o.id}
              type="button"
              role="menuitem"
              onClick={() => {
                onChange(o.id);
                setOpen(false);
              }}
              className={cx(
                "flex w-full items-start gap-2 rounded-md px-2.5 py-1.5 text-left transition hover:bg-[var(--surface-inset)]",
                o.id === value ? "text-[var(--accent-contrast)]" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
              )}
            >
              <span className="mt-0.5">{o.icon}</span>
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="text-xs font-semibold">{o.label}</span>
                <span className="text-[10px] leading-tight text-[var(--text-muted)]">{o.hint}</span>
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

type VoiceInputState = "checking" | "unsupported" | "idle" | "listening";

type BrowserSpeechRecognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onend: (() => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onresult: ((event: ArcSpeechRecognitionEvent) => void) | null;
  abort: () => void;
  start: () => void;
  stop: () => void;
};

type SpeechRecognitionConstructor = new () => BrowserSpeechRecognition;

type ArcSpeechRecognitionResult = {
  isFinal: boolean;
  0?: { transcript?: string };
};

type ArcSpeechRecognitionEvent = {
  resultIndex?: number;
  results: {
    length: number;
    [index: number]: ArcSpeechRecognitionResult;
  };
};

type SpeechRecognitionWindow = Window & {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
};

function getSpeechRecognitionConstructor(): SpeechRecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  const speechWindow = window as SpeechRecognitionWindow;
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition ?? null;
}

function mergeVoiceTranscript(base: string, transcript: string): string {
  const spoken = transcript.trim();
  if (!spoken) return base;
  const spacer = base.trim().length > 0 && !/\s$/.test(base) ? " " : "";
  return `${base}${spacer}${spoken}`;
}

/** Keyboard-hint footer shown under the slash/mention popovers (Codex-style). */
export function PopoverHint() {
  const key = "rounded border border-[var(--border-strong)] px-1 font-mono text-[9px] leading-none text-[var(--text-secondary)]";
  return (
    <div className="flex items-center gap-3 border-t border-[var(--border-hairline)] px-3 py-1.5 text-[10px] text-[var(--text-muted)]">
      <span className="flex items-center gap-1">
        <kbd className={key}>↑</kbd>
        <kbd className={key}>↓</kbd>
        navigate
      </span>
      <span className="flex items-center gap-1">
        <kbd className={key}>↵</kbd>
        select
      </span>
      <span className="flex items-center gap-1">
        <kbd className={key}>esc</kbd>
        dismiss
      </span>
    </div>
  );
}

export function Composer({
  conversationId,
  mentionGroups,
  draft,
  onDraftChange,
  textareaRef,
  onOptimistic,
  onSent,
  onSendFailed,
  registerSubmit,
  registerApplyCommand,
  replyPending,
  onStopReply,
  projects,
  activeProjectId,
  initialNewChatProjectId = null,
  mode,
  route,
  onModeChange,
  onRouteChange,
  assistantName = "Agent",
  demo = false,
  onDemoSend,
  onSlashOpenChange,
  recallText = null,
  initialSkill = null,
}: {
  conversationId: string;
  mentionGroups: MentionGroup[];
  projects: ArcProject[];
  activeProjectId: string | null;
  /** Pre-selected project for a fresh chat (from the ?project=<id> deep link). */
  initialNewChatProjectId?: string | null;
  /** Mode/route are lifted to ArcChat so Regenerate reuses the live selection. */
  mode: ArcMode;
  route: ArcRoute;
  onModeChange: (mode: ArcMode) => void;
  onRouteChange: (route: ArcRoute) => void;
  assistantName?: string;
  draft: string;
  onDraftChange: (value: string) => void;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  onOptimistic: (message: ArcMessage) => void;
  onSent: (conversationId?: string) => void;
  /** Called when a send fails so the parent can resolve its optimistic
   *  "thinking" bubble into a retryable failed reply. */
  onSendFailed?: (message: string) => void;
  registerSubmit?: (fn: () => void) => void;
  registerApplyCommand?: (fn: (cmd: SlashCommand) => void) => void;
  replyPending?: boolean;
  onStopReply?: () => void;
  /** Preview mode: send locally (no server action) via onDemoSend. */
  demo?: boolean;
  onDemoSend?: (text: string) => void;
  /** Notifies the parent when the slash/command menu opens or closes, so the
   *  empty-state quick cards can hide and never stack under a duplicate list. */
  onSlashOpenChange?: (open: boolean) => void;
  /** Body of the last operator message; ArrowUp in an empty composer recalls it
   *  for a quick re-send/edit (shell-history muscle memory). */
  recallText?: string | null;
  /** Skill (slash-command id, no leading slash) to pre-apply on a fresh chat,
   *  from the sidebar Skills launcher deep link (?skill=<id>). */
  initialSkill?: string | null;
}) {
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  // For a new chat the picked project rides along as a hidden input (assigned on
  // create); for an existing chat changing it moves the thread immediately.
  const [newChatProjectId, setNewChatProjectId] = useState<string | null>(initialNewChatProjectId);
  const projectWrapRef = useRef<HTMLDivElement>(null);
  const selectedProjectId = conversationId ? activeProjectId : newChatProjectId;
  const selectedProjectName = projects.find((p) => p.id === selectedProjectId)?.name ?? null;

  // The composer keeps a stable tree slot across thread navigation (it never
  // remounts), so the initial-state seed alone won't react to a later
  // ?project=<id> deep link. Sync when that prop changes; the dependency guard
  // means a manual project change in the same fresh chat is preserved.
  useEffect(() => {
    void Promise.resolve().then(() => setNewChatProjectId(initialNewChatProjectId));
  }, [initialNewChatProjectId]);

  useEffect(() => {
    if (!projectMenuOpen) return;
    function onDown(e: MouseEvent) {
      if (projectWrapRef.current && !projectWrapRef.current.contains(e.target as Node)) setProjectMenuOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setProjectMenuOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [projectMenuOpen]);

  async function chooseProject(id: string | null) {
    setProjectMenuOpen(false);
    if (conversationId) {
      const fd = new FormData();
      fd.set("conversationId", conversationId);
      fd.set("projectId", id ?? "");
      await moveConversationForm(fd);
    } else {
      setNewChatProjectId(id);
    }
  }

  const projectItemCls = (active: boolean) =>
    cx(
      "flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs transition hover:bg-[var(--surface-inset)]",
      active ? "font-semibold text-[var(--accent-contrast)]" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
    );
  const [state, formAction, isPending] = useActionState<SendMessageState, FormData>(sendArcMessageAction, null);
  const [picked, setPicked] = useState<ArcMention[]>([]);
  const [query, setQuery] = useState<string | null>(null); // non-null when the @-popover is open
  const [slash, setSlash] = useState<SlashCommand[] | null>(null); // non-null when the /-popover is open
  const [activeIndex, setActiveIndex] = useState(0); // highlighted row in whichever menu is open
  const [command, setCommand] = useState<string | null>(null); // structured command attached to the next send
  const [attachments, setAttachments] = useState<ArcAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [voiceState, setVoiceState] = useState<VoiceInputState>("checking");
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const voiceBaseDraftRef = useRef("");
  const voiceTranscriptRef = useRef("");
  const voiceShouldListenRef = useRef(false);
  const voiceRestartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const appliedInitialSkillRef = useRef<string | null>(null);

  useEffect(() => {
    if (conversationId || !initialSkill || appliedInitialSkillRef.current === initialSkill) return;
    const commandForSkill = SLASH_COMMANDS.find((c) => c.cmd.replace(/^\//, "") === initialSkill);
    if (!commandForSkill) return;
    appliedInitialSkillRef.current = initialSkill;
    void Promise.resolve().then(() => {
      setCommand(commandForSkill.cmd.replace(/^\//, ""));
      if (commandForSkill.mode) onModeChange(commandForSkill.mode);
      onDraftChange("");
      setSlash(null);
      setActiveIndex(0);
      textareaRef.current?.focus();
    });
  }, [conversationId, initialSkill, onDraftChange, onModeChange, textareaRef]);

  useEffect(() => {
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (!cancelled) setVoiceState(getSpeechRecognitionConstructor() ? "idle" : "unsupported");
    });
    return () => {
      cancelled = true;
      voiceShouldListenRef.current = false;
      if (voiceRestartTimerRef.current) clearTimeout(voiceRestartTimerRef.current);
      recognitionRef.current?.abort();
      recognitionRef.current = null;
    };
  }, []);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        if (!file.type.startsWith("image/")) continue;
        const ticket = await createArcUploadUrlAction(file.name, file.type);
        if (!ticket.ok) continue;
        const put = await fetch(ticket.uploadUrl, { method: "PUT", headers: { "content-type": file.type }, body: file });
        if (!put.ok) continue;
        setAttachments((prev) => [
          ...prev,
          { url: ticket.readUrl, objectPath: ticket.objectPath, contentType: file.type, name: file.name },
        ]);
      }
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  // Let the parent trigger a send (used by Retry). Submits the current draft.
  useEffect(() => {
    registerSubmit?.(() => {
      if (!draft.trim()) return;
      formRef.current?.requestSubmit();
    });
  }, [registerSubmit, draft]);

  // Let the parent (command palette) apply a slash command through the same path
  // the inline popover uses — presets prompt text, structured command id, mode, focus.
  useEffect(() => {
    registerApplyCommand?.((c: SlashCommand) => applySlash(c));
    // applySlash closes over stable setters/refs; re-register only if the registrar changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registerApplyCommand]);

  // Auto-grow the textarea to fit its content (capped), and shrink on reset.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [draft, textareaRef]);

  // Surface the command-menu open state so the empty-state quick cards can step
  // aside — the cards and the slash list are the same actions; never show both.
  const slashOpen = slash !== null && slash.length > 0;
  useEffect(() => {
    onSlashOpenChange?.(slashOpen);
  }, [slashOpen, onSlashOpenChange]);

  // Notify parent when a send completes.
  const lastHandled = useRef<SendMessageState>(null);
  useEffect(() => {
    if (state && state !== lastHandled.current) {
      lastHandled.current = state;
      if (state.ok) {
        const newId = state.conversationId;
        // Schedule setState asynchronously to satisfy the set-state-in-effect lint rule.
        void Promise.resolve().then(() => {
          onDraftChange("");
          setPicked([]);
          setSlash(null);
          setCommand(null);
          setAttachments([]);
          onSent(newId);
        });
      } else {
        // Resolve the parent's optimistic "thinking" bubble so it doesn't hang.
        void Promise.resolve().then(() => onSendFailed?.(state.message));
      }
    }
  }, [state, onSent, onDraftChange, onSendFailed]);

  const suggestions = useMemo(() => {
    if (query === null) return [];
    const q = query.toLowerCase();
    const flat = mentionGroups.flatMap((g) => g.items);
    return flat.filter((m) => m.label.toLowerCase().includes(q)).slice(0, 6);
  }, [query, mentionGroups]);

  function onTextChange(value: string) {
    onDraftChange(value);
    const at = /@([\w-]*)$/.exec(value);
    setQuery(at ? at[1] : null);
    setSlash(matchSlash(value));
    setActiveIndex(0);
  }

  function stopVoiceInput() {
    voiceShouldListenRef.current = false;
    if (voiceRestartTimerRef.current) {
      clearTimeout(voiceRestartTimerRef.current);
      voiceRestartTimerRef.current = null;
    }
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setVoiceState("idle");
    textareaRef.current?.focus();
  }

  function startVoiceInput(resume = false) {
    const Recognition = getSpeechRecognitionConstructor();
    if (!Recognition) {
      setVoiceState("unsupported");
      setVoiceError("Voice input is not available in this browser.");
      return;
    }

    recognitionRef.current?.abort();
    const recognition = new Recognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = typeof navigator === "undefined" ? "en-US" : navigator.language || "en-US";
    if (!resume) {
      voiceBaseDraftRef.current = draft;
      voiceTranscriptRef.current = "";
      voiceShouldListenRef.current = true;
    }
    setVoiceError(null);

    recognition.onresult = (event) => {
      let interimTranscript = "";
      for (let i = event.resultIndex ?? 0; i < event.results.length; i += 1) {
        const result = event.results[i];
        const transcript = result?.[0]?.transcript ?? "";
        if (result?.isFinal) {
          voiceTranscriptRef.current = mergeVoiceTranscript(voiceTranscriptRef.current, transcript);
        } else {
          interimTranscript = mergeVoiceTranscript(interimTranscript, transcript);
        }
      }
      const spoken = mergeVoiceTranscript(voiceTranscriptRef.current, interimTranscript);
      onTextChange(mergeVoiceTranscript(voiceBaseDraftRef.current, spoken));
    };

    recognition.onerror = (event) => {
      if (event.error === "no-speech" && voiceShouldListenRef.current) return;
      if (event.error === "aborted" && !voiceShouldListenRef.current) return;
      const message =
        event.error === "not-allowed" || event.error === "service-not-allowed"
          ? "Microphone access is blocked."
          : "Voice input stopped unexpectedly.";
      voiceShouldListenRef.current = false;
      setVoiceError(message);
      setVoiceState("idle");
    };

    recognition.onend = () => {
      recognitionRef.current = null;
      if (voiceShouldListenRef.current) {
        voiceRestartTimerRef.current = setTimeout(() => startVoiceInput(true), 120);
        return;
      }
      setVoiceState((current) => (current === "listening" ? "idle" : current));
    };

    recognitionRef.current = recognition;
    setVoiceState("listening");
    try {
      recognition.start();
      textareaRef.current?.focus();
    } catch {
      recognitionRef.current = null;
      voiceShouldListenRef.current = false;
      setVoiceState("idle");
      setVoiceError("Voice input could not start.");
    }
  }

  function toggleVoiceInput() {
    if (voiceState === "listening") {
      stopVoiceInput();
      return;
    }
    startVoiceInput();
  }

  function addMention(m: ArcMention) {
    setPicked((prev) => (prev.some((p) => p.type === m.type && p.id === m.id) ? prev : [...prev, m]));
    onDraftChange(draft.replace(/@([\w-]*)$/, "").trimEnd() + " ");
    setQuery(null);
    textareaRef.current?.focus();
  }

  function applySlash(c: SlashCommand) {
    // Codex-style: the command becomes a clean chip (structured intent on the
    // next send) — we DON'T paste a template prompt into the input. The "/query"
    // text is cleared so the operator just types their message.
    setCommand(c.cmd.replace(/^\//, ""));
    if (c.mode) onModeChange(c.mode); // preset the stance the command implies (e.g. Draft)
    onDraftChange("");
    setSlash(null);
    setActiveIndex(0);
    requestAnimationFrame(() => textareaRef.current?.focus());
  }

  // Which autocomplete menu is open (mutually exclusive in practice — a draft
  // can't both start with `/` and end with `@`). `slashOpen` is defined above.
  const mentionOpen = query !== null && suggestions.length > 0;
  const menuOpen = mentionOpen || slashOpen;
  const MENTION_LIST_ID = "arc-mention-menu";
  const SLASH_LIST_ID = "arc-slash-menu";
  const activeListId = mentionOpen ? MENTION_LIST_ID : SLASH_LIST_ID;
  const activeMenuLen = mentionOpen ? suggestions.length : slashOpen ? (slash?.length ?? 0) : 0;

  const mentionRows: MenuRow[] = suggestions.map((m) => ({
    key: `${m.type}:${m.id}`,
    icon: <MentionIcon type={m.type} />,
    title: m.label,
    group: MENTION_TYPE_LABEL[m.type],
  }));
  const slashRows: MenuRow[] = (slash ?? []).map((c) => ({
    key: c.cmd,
    icon: <SlashIcon cmd={c.cmd} />,
    title: c.label,
    meta: c.hint,
    trailing: <span className="font-mono text-[10px] text-[var(--text-muted)]">{c.cmd}</span>,
  }));

  /** Commit the highlighted menu row (shared by Enter, Tab, and click). */
  function selectActive() {
    if (mentionOpen) {
      const m = suggestions[Math.min(activeIndex, suggestions.length - 1)];
      if (m) addMention(m);
    } else if (slashOpen && slash) {
      const c = slash[Math.min(activeIndex, slash.length - 1)];
      if (c) applySlash(c);
    }
  }

  const disabled = isPending || uploading || (!draft.trim() && attachments.length === 0);

  return (
    <div className="mx-auto w-full max-w-[92rem] px-4 pb-4 pt-2 sm:px-6 xl:px-8">
      <form
        ref={formRef}
        action={demo ? undefined : formAction}
        className="relative"
        onSubmit={(e) => {
          if (!draft.trim() && attachments.length === 0) return;
          if (voiceState === "listening") stopVoiceInput();
          if (demo) {
            // Preview mode: no server action — echo locally so the flow is testable.
            e.preventDefault();
            onDemoSend?.(draft.trim());
            return;
          }
          onOptimistic(tempMessage(conversationId, draft.trim() || "Shared an image for reference.", picked, attachments));
          // Clear the composer immediately (ChatGPT/Claude feel) rather than
          // waiting for the server round-trip — Arc's reply can take seconds.
          // Deferred past this submit's synchronous form serialization so the
          // body/mentions/command/attachments hidden inputs still send their
          // current values. The success effect below re-clears (a no-op); on
          // error, onSendFailed resolves the optimistic "thinking" bubble into a
          // retryable failed reply (your message bubble stays in the thread).
          requestAnimationFrame(() => {
            onDraftChange("");
            setPicked([]);
            setSlash(null);
            setCommand(null);
            setAttachments([]);
          });
        }}
      >
        <input type="hidden" name="conversationId" value={conversationId} />
        <input type="hidden" name="body" value={draft} />
        <input type="hidden" name="mentions" value={serializeMentions(picked)} />
        {/* Per-message mode/route from the footer selectors; gates still enforce limits. */}
        <input type="hidden" name="mode" value={mode} />
        <input type="hidden" name="route" value={route} />
        <input type="hidden" name="command" value={command ?? ""} />
        <input type="hidden" name="attachments" value={JSON.stringify(attachments)} />
        {/* Project chosen in the footer selector — assigned when this send creates a new thread. */}
        <input type="hidden" name="projectId" value={newChatProjectId ?? ""} />

        {mentionOpen ? (
          <AutocompleteMenu
            listId={MENTION_LIST_ID}
            rows={mentionRows}
            activeIndex={activeIndex}
            onActiveChange={setActiveIndex}
            onSelect={(i) => {
              const m = suggestions[i];
              if (m) addMention(m);
            }}
          />
        ) : null}

        {slashOpen ? (
          <AutocompleteMenu
            listId={SLASH_LIST_ID}
            rows={slashRows}
            activeIndex={activeIndex}
            onActiveChange={setActiveIndex}
            onSelect={(i) => {
              const c = slash?.[i];
              if (c) applySlash(c);
            }}
          />
        ) : null}

        <div
          onDragOver={(e) => {
            if (Array.from(e.dataTransfer.types).includes("Files")) {
              e.preventDefault();
              setDragActive(true);
            }
          }}
          onDragLeave={(e) => {
            // Only clear when the cursor actually leaves the box, not on child enter.
            if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragActive(false);
          }}
          onDrop={(e) => {
            const files = e.dataTransfer.files;
            if (files && files.length > 0) {
              e.preventDefault();
              void handleFiles(files);
            }
            setDragActive(false);
          }}
          className={cx(
            "arc-composer-glow relative flex flex-col gap-2 rounded-[1.75rem] border bg-[var(--surface-panel)] px-3 py-2.5 shadow-[var(--elev-panel)] transition duration-200 focus-within:border-[var(--accent)]",
            dragActive ? "border-[var(--accent)] shadow-[0_0_0_2px_var(--accent-soft)]" : "border-[var(--border-hairline)]",
          )}
        >
          {dragActive ? (
            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-[1.75rem] bg-[var(--surface-panel)]/85 text-xs font-semibold text-[var(--accent-contrast)] backdrop-blur-sm">
              Drop image to attach
            </div>
          ) : null}
          {attachments.length > 0 || uploading ? (
            <div className="flex flex-wrap items-center gap-2">
              {attachments.map((a) => (
                <span key={a.objectPath} className="group relative h-14 w-14 overflow-hidden rounded-lg shadow-[inset_0_0_0_1px_var(--border-strong)]">
                  {/* eslint-disable-next-line @next/next/no-img-element -- signed GCS URL, no optimizer config */}
                  <img src={a.url} alt={a.name} className="h-full w-full object-cover" />
                  <button
                    type="button"
                    aria-label={`Remove ${a.name}`}
                    onClick={() => setAttachments((prev) => prev.filter((p) => p.objectPath !== a.objectPath))}
                    className="absolute right-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-[var(--surface-raised)] text-xs text-[var(--text-secondary)] opacity-0 transition group-hover:opacity-100 hover:text-[var(--priority-bright)]"
                  >
                    ×
                  </button>
                </span>
              ))}
              {uploading ? (
                <span className="flex h-14 w-14 items-center justify-center rounded-lg text-[var(--text-muted)] shadow-[inset_0_0_0_1px_var(--border-hairline)]">
                  <Spinner />
                </span>
              ) : null}
            </div>
          ) : null}
          {command || picked.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {command ? (
                <span className="inline-flex items-center gap-1 rounded-md bg-[var(--accent-soft)] px-2 py-0.5 font-mono text-xs font-semibold text-[var(--accent-strong)] shadow-[inset_0_0_0_1px_var(--accent-border-strong)]">
                  /{command}
                  <button
                    type="button"
                    aria-label="Remove command"
                    onClick={() => setCommand(null)}
                    className="text-[var(--text-muted)] transition hover:text-[var(--priority-bright)]"
                  >
                    ×
                  </button>
                </span>
              ) : null}
              {picked.map((m) => (
                <span
                  key={`${m.type}:${m.id}`}
                  className="inline-flex items-center gap-1 rounded-md border border-[var(--accent-border-strong)] bg-[var(--accent-soft)] px-2 py-0.5 text-xs font-semibold text-[var(--accent-contrast)]"
                >
                  @{m.label}
                  <button
                    type="button"
                    aria-label={`Remove ${m.label}`}
                    onClick={() => setPicked((prev) => prev.filter((p) => !(p.type === m.type && p.id === m.id)))}
                    className="text-[var(--text-muted)] transition hover:text-[var(--priority-bright)]"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          ) : null}

          <textarea
            ref={textareaRef}
            name="body-display"
            value={draft}
            onChange={(e) => onTextChange(e.target.value)}
            onPaste={(e) => {
              // Pasted screenshots/images upload like the file picker; text paste
              // falls through to the default textarea behaviour.
              const files = e.clipboardData?.files;
              if (files && files.length > 0 && Array.from(files).some((f) => f.type.startsWith("image/"))) {
                e.preventDefault();
                void handleFiles(files);
              }
            }}
            onKeyDown={(e) => {
              // An open autocomplete menu owns the arrows, Enter/Tab (select) and
              // Escape (dismiss) so the keyboard never has to leave the textarea.
              if (menuOpen && activeMenuLen > 0) {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setActiveIndex((i) => (i + 1) % activeMenuLen);
                  return;
                }
                if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setActiveIndex((i) => (i - 1 + activeMenuLen) % activeMenuLen);
                  return;
                }
                if ((e.key === "Enter" && !e.shiftKey) || e.key === "Tab") {
                  e.preventDefault();
                  selectActive();
                  return;
                }
                if (e.key === "Escape") {
                  e.preventDefault();
                  if (mentionOpen) setQuery(null);
                  else setSlash(null);
                  return;
                }
              }
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (!disabled) formRef.current?.requestSubmit();
              } else if (e.key === "ArrowUp" && draft.length === 0 && recallText) {
                // Empty composer: recall the last message to re-send or tweak.
                e.preventDefault();
                onDraftChange(recallText);
              }
            }}
            rows={1}
            placeholder={`Message ${assistantName}...`}
            style={{ outline: "none" }}
            role="combobox"
            aria-expanded={menuOpen}
            aria-controls={menuOpen ? activeListId : undefined}
            aria-activedescendant={menuOpen ? `${activeListId}-opt-${activeIndex}` : undefined}
            aria-autocomplete="list"
            className="max-h-[200px] min-h-12 w-full resize-none bg-transparent px-1 py-1.5 text-sm leading-6 text-[var(--text-primary)] transition-[height] duration-150 ease-out placeholder:text-[var(--text-muted)] motion-reduce:transition-none"
          />

          <div className="flex items-center justify-between gap-2 border-t border-[var(--border-hairline)] pt-2">
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              aria-label="Attach image"
              title="Attach a reference image"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[var(--text-muted)] transition hover:bg-[var(--surface-inset)] hover:text-[var(--text-primary)] disabled:opacity-50"
            >
              <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10 5v10M5 10h10" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => {
                setSlash((s) => (s && s.length ? null : SLASH_COMMANDS));
                setActiveIndex(0);
                textareaRef.current?.focus();
              }}
              aria-label="Tools and commands"
              title="Tools - run a command"
              className="flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm font-medium text-[var(--text-muted)] transition hover:bg-[var(--surface-inset)] hover:text-[var(--text-primary)]"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 7h-9" />
                <path d="M14 17H5" />
                <circle cx="17" cy="17" r="3" />
                <circle cx="7" cy="7" r="3" />
              </svg>
              Tools
            </button>
            <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={(e) => handleFiles(e.target.files)} className="hidden" />
            <button
              type="button"
              onClick={toggleVoiceInput}
              disabled={voiceState === "checking" || voiceState === "unsupported" || isPending}
              aria-label={voiceState === "listening" ? "Stop voice input" : "Start voice input"}
              aria-pressed={voiceState === "listening"}
              title={voiceState === "unsupported" ? "Voice input is not available in this browser" : voiceState === "listening" ? "Stop voice input" : "Speak a message"}
              className={cx(
                "relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition active:scale-95 after:hidden",
                voiceState === "listening"
                  ? "bg-[var(--accent)] text-[var(--on-accent)] shadow-[inset_0_0_0_1px_var(--accent-border-strong)]"
                  : "text-[var(--text-muted)] hover:bg-[var(--surface-inset)] hover:text-[var(--text-primary)]",
                voiceState === "checking" || voiceState === "unsupported" || isPending ? "cursor-not-allowed opacity-45 hover:bg-transparent hover:text-[var(--text-muted)]" : "",
              )}
            >
              <svg viewBox="0 0 20 20" className="h-4.5 w-4.5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M10 3.5a2.5 2.5 0 0 0-2.5 2.5v3.5a2.5 2.5 0 0 0 5 0V6A2.5 2.5 0 0 0 10 3.5Z" />
                <path d="M5.5 9.5a4.5 4.5 0 0 0 9 0" />
                <path d="M10 14v2.5" />
                <path d="M7.5 16.5h5" />
              </svg>
            </button>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
            {replyPending ? (
              <button
                type="button"
                onClick={() => onStopReply?.()}
                aria-label={`Stop ${assistantName}`}
                title="Stop"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--surface-raised)] text-[var(--text-primary)] shadow-[inset_0_0_0_1px_var(--border-strong)] transition hover:text-[var(--priority-bright)] active:scale-95"
              >
                <span aria-hidden className="h-3 w-3 rounded-[2px] bg-current" />
              </button>
            ) : (
              <button
                type="submit"
                disabled={disabled}
                aria-label="Send message"
                className={cx(
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition duration-200 ease-out",
                  disabled
                    ? "cursor-not-allowed bg-[var(--surface-raised)] text-[var(--text-muted)]"
                    : "bg-[var(--accent)] text-[var(--on-accent)] hover:bg-[var(--accent-hover)] active:scale-95",
                )}
              >
                {isPending ? <Spinner /> : <SendIcon />}
              </button>
            )}
            </div>
          </div>
        </div>

        {state && !state.ok ? (
          <p className="mt-2 text-xs font-medium text-[var(--priority-bright)]">{state.message}</p>
        ) : null}
        {voiceError ? (
          <p className="mt-2 text-xs font-medium text-[var(--text-muted)]">{voiceError}</p>
        ) : null}

        {/* Visible context selectors below the box: Arc model, mode, project — like the reference composer. */}
        <div className="mt-2 flex flex-wrap items-center gap-2 px-1 text-[11px] text-[var(--text-muted)]">
          <ModelSelect value={route} onChange={onRouteChange} />

          <PillSelect
            ariaLabel="Mode"
            value={mode}
            options={MODE_OPTIONS}
            onChange={onModeChange}
          />

          <div ref={projectWrapRef} className="relative">
            <button
              type="button"
              onClick={() => setProjectMenuOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={projectMenuOpen}
              className={cx(
                "flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition",
                projectMenuOpen
                  ? "bg-[var(--surface-inset)] text-[var(--text-primary)]"
                  : selectedProjectName
                    ? "text-[var(--text-secondary)] hover:bg-[var(--surface-inset)] hover:text-[var(--text-primary)]"
                    : "text-[var(--text-muted)] hover:bg-[var(--surface-inset)] hover:text-[var(--text-primary)]",
              )}
            >
              <svg viewBox="0 0 20 20" aria-hidden className="h-3.5 w-3.5 text-[var(--text-muted)]" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2.5 5.5A1.5 1.5 0 0 1 4 4h3l2 2.5h5a1.5 1.5 0 0 1 1.5 1.5v6.5a1.5 1.5 0 0 1-1.5 1.5H4a1.5 1.5 0 0 1-1.5-1.5z" />
              </svg>
              {selectedProjectName ?? "No project"}
              <svg viewBox="0 0 20 20" aria-hidden className="h-3 w-3 text-[var(--text-muted)]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="m6 8 4 4 4-4" />
              </svg>
            </button>
            {projectMenuOpen ? (
              <div role="menu" className="absolute bottom-full left-0 z-20 mb-1.5 max-h-56 w-52 overflow-y-auto rounded-xl border border-[var(--border-panel)] bg-[var(--surface-raised)] p-1.5 shadow-[var(--elev-raised)]">
                <button type="button" role="menuitem" onClick={() => chooseProject(null)} className={projectItemCls(selectedProjectId === null)}>
                  No project
                </button>
                {projects.map((p) => (
                  <button key={p.id} type="button" role="menuitem" onClick={() => chooseProject(p.id)} className={projectItemCls(selectedProjectId === p.id)}>
                    {p.name}
                  </button>
                ))}
                {projects.length === 0 ? (
                  <p className="px-2.5 py-2 text-xs text-[var(--text-muted)]">No projects yet. Create one in the sidebar.</p>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </form>
    </div>
  );
}
