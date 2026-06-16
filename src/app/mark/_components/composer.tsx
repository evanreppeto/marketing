"use client";

import { startTransition, useActionState, useEffect, useMemo, useRef, useState, type RefObject } from "react";

import { cx } from "@/app/_components/theme";
import {
  Attachment,
  AttachmentPreview,
  AttachmentRemove,
  Attachments,
} from "@/components/ai-elements/attachments";
import {
  ModelSelector,
  ModelSelectorContent,
  ModelSelectorEmpty,
  ModelSelectorGroup,
  ModelSelectorInput,
  ModelSelectorItem,
  ModelSelectorList,
  ModelSelectorLogo,
  ModelSelectorLogoGroup,
  ModelSelectorName,
  ModelSelectorTrigger,
} from "@/components/ai-elements/model-selector";
import {
  PromptInput,
  PromptInputActionAddAttachments,
  PromptInputActionAddScreenshot,
  PromptInputActionMenu,
  PromptInputActionMenuContent,
  PromptInputActionMenuItem,
  PromptInputActionMenuTrigger,
  PromptInputBody,
  PromptInputButton,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
  usePromptInputAttachments,
  type PromptInputMessage,
} from "@/components/ai-elements/prompt-input";
import type { MarkMention, MarkMode, MarkRoute } from "@/domain";
import { serializeMentions } from "@/domain";
import { matchSlash, SLASH_COMMANDS, type SlashCommand } from "./slash-commands";
import type { MarkAttachment, MarkMessage, MarkProject } from "@/lib/mark-chat/persistence";
import type { MentionGroup } from "@/lib/mark-chat/mention-search";
import { CheckIcon, MicIcon } from "lucide-react";

import { createMarkUploadUrlAction, moveConversationForm, sendMarkMessageAction, type SendMessageState } from "../actions";

function tempMessage(conversationId: string, body: string, mentions: MarkMention[], attachments: MarkAttachment[]): MarkMessage {
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
    <svg viewBox="0 0 20 20" aria-hidden className="h-3.5 w-3.5 shrink-0 text-[var(--accent)]" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}

const MODE_OPTIONS: PillOption<MarkMode>[] = [
  // Act = checkmark (decisive), Ask = speech bubble (answer only), Draft = pencil.
  { id: "act", label: "Act", hint: "Do the work - create approval-ready records", icon: <Glyph><path d="M4 10.5l3.5 3.5L16 5.5" /></Glyph> },
  { id: "ask", label: "Ask", hint: "Answer only - produce no work", icon: <Glyph><path d="M4 5.5h12v7H8l-3 2.5V12.5H4z" /></Glyph> },
  { id: "draft", label: "Draft", hint: "Draft content for your review", icon: <Glyph><path d="M4 13.5V16h2.5l8-8L12 5.5l-8 8z" /><path d="M11 6.5l2.5 2.5" /></Glyph> },
];

type ComposerModelOption = {
  chef: "Anthropic";
  chefSlug: "anthropic";
  id: MarkRoute;
  name: string;
  hint: string;
  providers: ["anthropic"];
};

const MODEL_OPTIONS: ComposerModelOption[] = [
  {
    chef: "Anthropic",
    chefSlug: "anthropic",
    id: "fast",
    name: "Claude Fast",
    hint: "Quick replies and lighter edits",
    providers: ["anthropic"],
  },
  {
    chef: "Anthropic",
    chefSlug: "anthropic",
    id: "standard",
    name: "Claude Standard",
    hint: "Deeper reasoning and production work",
    providers: ["anthropic"],
  },
];

/** Footer pill with a labelled dropdown - used for the per-message mode + model route
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
        className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium text-[var(--text-primary)] shadow-[inset_0_0_0_1px_var(--border-strong)] transition hover:bg-[var(--surface-inset)]"
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

function PromptInputAttachmentsDisplay({
  uploading,
  onCountChange,
}: {
  uploading: boolean;
  onCountChange: (count: number) => void;
}) {
  const promptAttachments = usePromptInputAttachments();

  useEffect(() => {
    onCountChange(promptAttachments.files.length);
  }, [promptAttachments.files.length, onCountChange]);

  if (promptAttachments.files.length === 0 && !uploading) return null;

  return (
    <Attachments className="px-3 pt-3" variant="inline">
      {promptAttachments.files.map((attachment) => (
        <Attachment
          key={attachment.id}
          data={attachment}
          onRemove={() => promptAttachments.remove(attachment.id)}
        >
          <AttachmentPreview />
          <span className="max-w-28 truncate text-xs">{attachment.filename ?? "Image"}</span>
          <AttachmentRemove />
        </Attachment>
      ))}
      {uploading ? (
        <span className="inline-flex h-8 items-center gap-2 rounded-md border border-[var(--border-hairline)] px-2 text-xs font-medium text-[var(--text-muted)]">
          <Spinner />
          Uploading
        </span>
      ) : null}
    </Attachments>
  );
}

function ModelOptionItem({
  model,
  selectedRoute,
  onSelect,
}: {
  model: ComposerModelOption;
  selectedRoute: MarkRoute;
  onSelect: (route: MarkRoute) => void;
}) {
  return (
    <ModelSelectorItem onSelect={() => onSelect(model.id)} value={model.id}>
      <ModelSelectorLogo provider={model.chefSlug} />
      <span className="flex min-w-0 flex-1 flex-col">
        <ModelSelectorName className="text-sm font-medium">{model.name}</ModelSelectorName>
        <span className="truncate text-xs text-[var(--text-muted)]">{model.hint}</span>
      </span>
      <ModelSelectorLogoGroup>
        {model.providers.map((provider) => (
          <ModelSelectorLogo key={provider} provider={provider} />
        ))}
      </ModelSelectorLogoGroup>
      {selectedRoute === model.id ? <CheckIcon className="ml-auto size-4" /> : <span className="ml-auto size-4" />}
    </ModelSelectorItem>
  );
}

type VoiceInputState = "checking" | "unsupported" | "idle" | "listening";

type BrowserSpeechRecognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onend: (() => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onresult: ((event: MarkSpeechRecognitionEvent) => void) | null;
  abort: () => void;
  start: () => void;
  stop: () => void;
};

type SpeechRecognitionConstructor = new () => BrowserSpeechRecognition;

type MarkSpeechRecognitionResult = {
  isFinal: boolean;
  0?: { transcript?: string };
};

type MarkSpeechRecognitionEvent = {
  resultIndex?: number;
  results: {
    length: number;
    [index: number]: MarkSpeechRecognitionResult;
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

export function Composer({
  conversationId,
  mentionGroups,
  draft,
  onDraftChange,
  textareaRef,
  onOptimistic,
  onSent,
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
}: {
  conversationId: string;
  mentionGroups: MentionGroup[];
  projects: MarkProject[];
  activeProjectId: string | null;
  /** Pre-selected project for a fresh chat (from the ?project=<id> deep link). */
  initialNewChatProjectId?: string | null;
  /** Mode/route are lifted to MarkChat so Regenerate reuses the live selection. */
  mode: MarkMode;
  route: MarkRoute;
  onModeChange: (mode: MarkMode) => void;
  onRouteChange: (route: MarkRoute) => void;
  assistantName?: string;
  draft: string;
  onDraftChange: (value: string) => void;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  onOptimistic: (message: MarkMessage) => void;
  onSent: (conversationId?: string) => void;
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
  const [state, formAction, isPending] = useActionState<SendMessageState, FormData>(sendMarkMessageAction, null);
  const [picked, setPicked] = useState<MarkMention[]>([]);
  const [query, setQuery] = useState<string | null>(null); // non-null when the @-popover is open
  const [slash, setSlash] = useState<SlashCommand[] | null>(null); // non-null when the /-popover is open
  const [command, setCommand] = useState<string | null>(null); // structured command attached to the next send
  const [uploading, setUploading] = useState(false);
  const [promptAttachmentCount, setPromptAttachmentCount] = useState(0);
  const [modelSelectorOpen, setModelSelectorOpen] = useState(false);
  const [voiceState, setVoiceState] = useState<VoiceInputState>("checking");
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const voiceBaseDraftRef = useRef("");
  const voiceTranscriptRef = useRef("");
  const voiceShouldListenRef = useRef(false);
  const voiceRestartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const submitButtonRef = useRef<HTMLButtonElement>(null);
  const selectedModel = MODEL_OPTIONS.find((model) => model.id === route) ?? MODEL_OPTIONS[0];

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

  async function uploadPromptAttachments(files: PromptInputMessage["files"]): Promise<MarkAttachment[]> {
    if (files.length === 0) return [];
    setUploading(true);
    try {
      const uploaded: MarkAttachment[] = [];
      for (const file of files) {
        const contentType = file.mediaType ?? "application/octet-stream";
        if (!contentType.startsWith("image/") || !file.url) continue;
        const name = file.filename ?? "reference-image";
        const source = await fetch(file.url);
        if (!source.ok) continue;
        const blob = await source.blob();
        const ticket = await createMarkUploadUrlAction(name, contentType);
        if (!ticket.ok) continue;
        const put = await fetch(ticket.uploadUrl, { method: "PUT", headers: { "content-type": contentType }, body: blob });
        if (!put.ok) continue;
        uploaded.push({ url: ticket.readUrl, objectPath: ticket.objectPath, contentType, name });
      }
      return uploaded;
    } finally {
      setUploading(false);
    }
  }

  // Let the parent trigger a send (used by Retry). Submits the current draft.
  useEffect(() => {
    registerSubmit?.(() => {
      if (!draft.trim() && promptAttachmentCount === 0) return;
      submitButtonRef.current?.click();
    });
  }, [registerSubmit, draft, promptAttachmentCount]);

  // Let the parent (command palette) apply a slash command through the same path
  // the inline popover uses â€” presets prompt text, structured command id, mode, focus.
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
  // aside â€” the cards and the slash list are the same actions; never show both.
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
          onSent(newId);
        });
      }
    }
  }, [state, onSent, onDraftChange]);

  const suggestions = useMemo(() => {
    if (query === null) return [];
    const q = query.toLowerCase();
    const flat = mentionGroups.flatMap((g) => g.items);
    return flat.filter((m) => m.label.toLowerCase().includes(q)).slice(0, 8);
  }, [query, mentionGroups]);

  function onTextChange(value: string) {
    onDraftChange(value);
    const at = /@([\w-]*)$/.exec(value);
    setQuery(at ? at[1] : null);
    setSlash(matchSlash(value));
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

  function addMention(m: MarkMention) {
    setPicked((prev) => (prev.some((p) => p.type === m.type && p.id === m.id) ? prev : [...prev, m]));
    onDraftChange(draft.replace(/@([\w-]*)$/, "").trimEnd() + " ");
    setQuery(null);
    textareaRef.current?.focus();
  }

  function applySlash(c: SlashCommand) {
    // The command id travels to the agent as structured intent (not just text).
    setCommand(c.cmd.replace(/^\//, ""));
    onDraftChange(c.prompt);
    setSlash(null);
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(c.prompt.length, c.prompt.length);
    });
  }

  const disabled = isPending || uploading || (!draft.trim() && promptAttachmentCount === 0);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-4 pt-2">
      <div className="relative">
        {query !== null && suggestions.length > 0 ? (
          <div className="absolute bottom-full left-0 right-0 mb-2 max-h-60 overflow-y-auto rounded-2xl border border-[var(--border-panel)] bg-[var(--surface-raised)] p-1.5 shadow-[var(--elev-raised)]">
            {suggestions.map((m) => (
              <button
                key={`${m.type}:${m.id}`}
                type="button"
                onClick={() => addMention(m)}
                className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm transition hover:bg-[var(--surface-inset)]"
              >
                <span className="truncate font-semibold text-[var(--text-primary)]">{m.label}</span>
                <span className="font-mono text-[10px] uppercase text-[var(--text-muted)]">{m.type}</span>
              </button>
            ))}
          </div>
        ) : null}

        {slash && slash.length > 0 ? (
          <div className="absolute bottom-full left-0 right-0 mb-2 max-h-60 overflow-y-auto rounded-2xl border border-[var(--border-panel)] bg-[var(--surface-raised)] p-1.5 shadow-[var(--elev-raised)]">
            {slash.map((c) => (
              <button
                key={c.cmd}
                type="button"
                onClick={() => applySlash(c)}
                className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm transition hover:bg-[var(--surface-inset)]"
              >
                <span className="flex items-center gap-2">
                  <span className="font-mono text-xs font-bold text-[var(--accent-contrast)]">{c.cmd}</span>
                  <span className="text-[var(--text-secondary)]">{c.label}</span>
                </span>
                <span className="truncate text-[11px] text-[var(--text-muted)]">{c.hint}</span>
              </button>
            ))}
          </div>
        ) : null}

        <PromptInput
          accept="image/*"
          className="rounded-[1.25rem] border-[var(--border-hairline)] bg-[var(--surface-panel)] text-[var(--text-primary)] shadow-[var(--elev-panel)] transition focus-within:border-[var(--accent)] focus-within:ring-2 focus-within:ring-[var(--accent-soft)]"
          maxFiles={6}
          multiple
          onSubmit={async (message, event) => {
            const text = message.text.trim();
            if (!text && message.files.length === 0) return;
            if (voiceState === "listening") stopVoiceInput();
            if (demo) {
              onDemoSend?.(text);
              return;
            }
            const uploadedAttachments = await uploadPromptAttachments(message.files);
            const body = text || (uploadedAttachments.length > 0 ? "Shared an image for reference." : "");
            if (!body && uploadedAttachments.length === 0) return;
            const formData = new FormData(event.currentTarget);
            formData.set("conversationId", conversationId);
            formData.set("body", body);
            formData.set("mentions", serializeMentions(picked));
            formData.set("mode", mode);
            formData.set("route", route);
            formData.set("command", command ?? "");
            formData.set("attachments", JSON.stringify(uploadedAttachments));
            formData.set("projectId", newChatProjectId ?? "");
            onOptimistic(tempMessage(conversationId, body, picked, uploadedAttachments));
            startTransition(() => formAction(formData));
          }}
        >
          <input type="hidden" name="conversationId" value={conversationId} />
          <input type="hidden" name="body" value={draft} />
          <input type="hidden" name="mentions" value={serializeMentions(picked)} />
          <input type="hidden" name="mode" value={mode} />
          <input type="hidden" name="route" value={route} />
          <input type="hidden" name="command" value={command ?? ""} />
          <input type="hidden" name="attachments" value="[]" />
          <input type="hidden" name="projectId" value={newChatProjectId ?? ""} />
          <button ref={submitButtonRef} type="submit" className="hidden" aria-hidden tabIndex={-1} />

          <PromptInputAttachmentsDisplay uploading={uploading} onCountChange={setPromptAttachmentCount} />
          {command || picked.length > 0 ? (
            <div className="flex flex-wrap gap-1.5 px-3 pt-3">
              {command ? (
                <span className="inline-flex items-center gap-1 rounded-md bg-[var(--accent-soft)] px-2 py-0.5 font-mono text-xs font-semibold text-[var(--accent-strong)] shadow-[inset_0_0_0_1px_var(--accent-border-strong)]">
                  /{command}
                  <button
                    type="button"
                    aria-label="Remove command"
                    onClick={() => setCommand(null)}
                    className="text-[var(--text-muted)] transition hover:text-[var(--priority-bright)]"
                  >
                    x
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
                    x
                  </button>
                </span>
              ))}
            </div>
          ) : null}

          <PromptInputBody>
            <PromptInputTextarea
              ref={textareaRef}
              name="body-display"
              value={draft}
              onChange={(e) => onTextChange(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && query === null && slash === null && disabled) {
                  e.preventDefault();
                }
              }}
              placeholder={`Message ${assistantName}...`}
              rows={1}
              className="max-h-[200px] min-h-14 px-3 py-3 text-sm leading-6 text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
            />
          </PromptInputBody>

          <PromptInputFooter className="border-t border-[var(--border-hairline)] px-3 pb-2.5 pt-2">
            <PromptInputTools className="flex-wrap gap-1.5">
              <PromptInputActionMenu>
                <PromptInputActionMenuTrigger tooltip="Add attachment or command" />
                <PromptInputActionMenuContent>
                  <PromptInputActionAddAttachments label="Attach image" />
                  <PromptInputActionAddScreenshot label="Take screenshot" />
                  <PromptInputActionMenuItem
                    onSelect={(event) => {
                      event.preventDefault();
                      setSlash((s) => (s && s.length ? null : SLASH_COMMANDS));
                      textareaRef.current?.focus();
                    }}
                  >
                    <Glyph><path d="M20 7h-9" /><path d="M14 17H5" /><circle cx="17" cy="17" r="3" /><circle cx="7" cy="7" r="3" /></Glyph>
                    Commands
                  </PromptInputActionMenuItem>
                </PromptInputActionMenuContent>
              </PromptInputActionMenu>
              <PromptInputButton
                aria-label={voiceState === "listening" ? "Stop voice input" : "Start voice input"}
                aria-pressed={voiceState === "listening"}
                disabled={voiceState === "checking" || voiceState === "unsupported" || isPending}
                onClick={toggleVoiceInput}
                tooltip={voiceState === "unsupported" ? "Voice input is not available in this browser" : voiceState === "listening" ? "Stop voice input" : "Speak a message"}
                className={cx(
                  voiceState === "listening"
                    ? "bg-[var(--accent)] text-[var(--on-accent)] hover:bg-[var(--accent-strong)]"
                    : "text-[var(--text-muted)]",
                )}
              >
                <MicIcon className="size-4" />
              </PromptInputButton>
              <div ref={projectWrapRef} className="relative">
                <PromptInputButton
                  aria-expanded={projectMenuOpen}
                  aria-haspopup="menu"
                  onClick={() => setProjectMenuOpen((v) => !v)}
                  tooltip="Project"
                >
                  <Glyph><path d="M2.5 5.5A1.5 1.5 0 0 1 4 4h3l2 2.5h5a1.5 1.5 0 0 1 1.5 1.5v6.5a1.5 1.5 0 0 1-1.5 1.5H4a1.5 1.5 0 0 1-1.5-1.5z" /></Glyph>
                  <span className="max-w-28 truncate">{selectedProjectName ?? "No project"}</span>
                </PromptInputButton>
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
              <PillSelect ariaLabel="Mode" value={mode} options={MODE_OPTIONS} onChange={onModeChange} />
              <ModelSelector open={modelSelectorOpen} onOpenChange={setModelSelectorOpen}>
                <ModelSelectorTrigger asChild>
                  <PromptInputButton tooltip="Model">
                    <ModelSelectorLogo provider={selectedModel.chefSlug} />
                    <ModelSelectorName className="max-w-28 text-xs font-medium">
                      {selectedModel.name}
                    </ModelSelectorName>
                  </PromptInputButton>
                </ModelSelectorTrigger>
                <ModelSelectorContent title="Choose a Claude model">
                  <ModelSelectorInput placeholder="Search Claude models..." />
                  <ModelSelectorList>
                    <ModelSelectorEmpty>No models found.</ModelSelectorEmpty>
                    <ModelSelectorGroup heading="Anthropic">
                      {MODEL_OPTIONS.map((model) => (
                        <ModelOptionItem
                          key={model.id}
                          model={model}
                          selectedRoute={route}
                          onSelect={(nextRoute) => {
                            onRouteChange(nextRoute);
                            setModelSelectorOpen(false);
                          }}
                        />
                      ))}
                    </ModelSelectorGroup>
                  </ModelSelectorList>
                </ModelSelectorContent>
              </ModelSelector>
            </PromptInputTools>
            <PromptInputSubmit
              disabled={!replyPending && disabled}
              onStop={replyPending ? onStopReply : undefined}
              status={replyPending ? "streaming" : isPending || uploading ? "submitted" : "ready"}
            />
          </PromptInputFooter>
        </PromptInput>

        {state && !state.ok ? (
          <p className="mt-2 text-xs font-medium text-[var(--priority-bright)]">{state.message}</p>
        ) : null}
        {voiceError ? (
          <p className="mt-2 text-xs font-medium text-[var(--text-muted)]">{voiceError}</p>
        ) : null}

        <div className="mt-2 flex justify-end px-1 text-[11px] text-[var(--text-muted)]">
          <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 shadow-[inset_0_0_0_1px_var(--border-hairline)]">
            <svg viewBox="0 0 20 20" aria-hidden className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.8">
              <rect x="5" y="9" width="10" height="7" rx="1.5" />
              <path d="M7 9V7a3 3 0 0 1 6 0v2" />
            </svg>
            outbound stays locked
          </span>
        </div>
      </div>
    </div>
  );
}
