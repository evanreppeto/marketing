"use client";

import {
  useActionState,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useTransition,
  type RefObject,
  type ReactNode,
} from "react";

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
} from "@/components/ai-elements/prompt-input";
import type { MarkMention, MarkMode, MarkRoute } from "@/domain";
import { serializeMentions } from "@/domain";
import type { MentionGroup } from "@/lib/mark-chat/mention-search";
import type { MarkAttachment, MarkMessage, MarkProject } from "@/lib/mark-chat/persistence";
import {
  ArrowUpIcon,
  CheckIcon,
  FolderIcon,
  GitBranchIcon,
  ImageIcon,
  MicIcon,
  MonitorIcon,
  PlusIcon,
  ShieldCheckIcon,
  SlidersHorizontalIcon,
  SquareIcon,
  XIcon,
} from "lucide-react";

import { createMarkUploadUrlAction, moveConversationForm, sendMarkMessageAction, type SendMessageState } from "../actions";
import { matchSlash, SLASH_COMMANDS, type SlashCommand } from "./slash-commands";

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
    <svg viewBox="0 0 24 24" className="size-4 motion-safe:animate-spin" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity="0.25" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

type PillOption<T extends string> = { id: T; label: string; hint: string; icon: ReactNode };

function Glyph({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden className="size-4 shrink-0 text-current" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}

const MODE_OPTIONS: PillOption<MarkMode>[] = [
  { id: "act", label: "Full access", hint: "Work inside the app while outbound stays locked", icon: <ShieldCheckIcon className="size-4" /> },
  { id: "ask", label: "Answer only", hint: "Respond without changing records", icon: <Glyph><path d="M4 5.5h12v7H8l-3 2.5V12.5H4z" /></Glyph> },
  { id: "draft", label: "Draft", hint: "Prepare content for review", icon: <Glyph><path d="M4 13.5V16h2.5l8-8L12 5.5l-8 8z" /><path d="M11 6.5l2.5 2.5" /></Glyph> },
];

type ComposerModelOption = {
  chef: "Anthropic";
  chefSlug: "anthropic";
  id: MarkRoute;
  name: string;
  shortName: string;
  hint: string;
  providers: ["anthropic"];
};

const MODEL_OPTIONS: ComposerModelOption[] = [
  { chef: "Anthropic", chefSlug: "anthropic", id: "claude-fable-5", name: "Claude Fable 5", shortName: "Fable 5", hint: "Highest capability", providers: ["anthropic"] },
  { chef: "Anthropic", chefSlug: "anthropic", id: "claude-opus-4-8", name: "Claude Opus 4.8", shortName: "Opus 4.8", hint: "Deep reasoning", providers: ["anthropic"] },
  { chef: "Anthropic", chefSlug: "anthropic", id: "claude-sonnet-4-6", name: "Claude Sonnet 4.6", shortName: "Sonnet 4.6", hint: "Balanced default", providers: ["anthropic"] },
  { chef: "Anthropic", chefSlug: "anthropic", id: "claude-haiku-4-5", name: "Claude Haiku 4.5", shortName: "Haiku 4.5", hint: "Fastest", providers: ["anthropic"] },
];

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
          "flex h-8 items-center gap-1.5 rounded-full px-2.5 text-sm font-medium transition hover:bg-white/5",
          value === "act" ? "text-[#ff8a3d]" : "text-white/68 hover:text-white",
        )}
      >
        <span className="flex">{current.icon}</span>
        <span className="max-w-[9rem] truncate">{current.label}</span>
        <Glyph><path d="m6 8 4 4 4-4" /></Glyph>
      </button>
      {open ? (
        <div role="menu" className="absolute bottom-full left-0 z-30 mb-2 w-64 overflow-hidden rounded-xl border border-white/10 bg-[#2f2f2f] p-1.5 shadow-[0_18px_50px_rgba(0,0,0,0.45)]">
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
                "flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left transition hover:bg-white/7",
                o.id === value ? "text-white" : "text-white/65",
              )}
            >
              <span className={cx("mt-0.5", o.id === "act" ? "text-[#ff8a3d]" : "")}>{o.icon}</span>
              <span className="grid min-w-0 gap-0.5">
                <span className="text-sm font-semibold">{o.label}</span>
                <span className="text-xs leading-tight text-white/42">{o.hint}</span>
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function UploadedAttachment({ attachment, onRemove }: { attachment: MarkAttachment; onRemove: (objectPath: string) => void }) {
  return (
    <Attachment
      data={{
        id: attachment.objectPath,
        type: "file",
        filename: attachment.name,
        mediaType: attachment.contentType,
        url: attachment.url,
      }}
      onRemove={() => onRemove(attachment.objectPath)}
    >
      <AttachmentPreview />
      <AttachmentRemove />
    </Attachment>
  );
}

function ModelOptionItem({
  option,
  selectedModel,
  onSelect,
}: {
  option: ComposerModelOption;
  selectedModel: MarkRoute;
  onSelect: (id: MarkRoute) => void;
}) {
  return (
    <ModelSelectorItem onSelect={() => onSelect(option.id)} value={option.id}>
      <ModelSelectorLogo provider={option.chefSlug} />
      <span className="grid min-w-0 flex-1 gap-0.5">
        <ModelSelectorName className="font-medium">{option.name}</ModelSelectorName>
        <span className="truncate text-xs text-muted-foreground">{option.hint}</span>
      </span>
      <ModelSelectorLogoGroup>
        {option.providers.map((provider) => (
          <ModelSelectorLogo key={provider} provider={provider} />
        ))}
      </ModelSelectorLogoGroup>
      {selectedModel === option.id ? <CheckIcon className="ml-auto size-4" /> : <span className="ml-auto size-4" />}
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
type MarkSpeechRecognitionResult = { isFinal: boolean; 0?: { transcript?: string } };
type MarkSpeechRecognitionEvent = { resultIndex?: number; results: { length: number; [index: number]: MarkSpeechRecognitionResult } };
type SpeechRecognitionWindow = Window & { SpeechRecognition?: SpeechRecognitionConstructor; webkitSpeechRecognition?: SpeechRecognitionConstructor };

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
  initialNewChatProjectId?: string | null;
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
  demo?: boolean;
  onDemoSend?: (text: string) => void;
  onSlashOpenChange?: (open: boolean) => void;
}) {
  const promptFormId = useId();
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  const [modelSelectorOpen, setModelSelectorOpen] = useState(false);
  const [newChatProjectId, setNewChatProjectId] = useState<string | null>(initialNewChatProjectId);
  const [state, formAction, isPending] = useActionState<SendMessageState, FormData>(sendMarkMessageAction, null);
  const [isDispatchPending, startSubmitTransition] = useTransition();
  const [picked, setPicked] = useState<MarkMention[]>([]);
  const [query, setQuery] = useState<string | null>(null);
  const [slash, setSlash] = useState<SlashCommand[] | null>(null);
  const [command, setCommand] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<MarkAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [voiceState, setVoiceState] = useState<VoiceInputState>("checking");
  const [voiceError, setVoiceError] = useState<string | null>(null);

  const projectWrapRef = useRef<HTMLDivElement>(null);
  const voiceBaseDraftRef = useRef("");
  const voiceTranscriptRef = useRef("");
  const voiceShouldListenRef = useRef(false);
  const voiceRestartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectedProjectId = conversationId ? activeProjectId : newChatProjectId;
  const selectedProjectName = projects.find((p) => p.id === selectedProjectId)?.name ?? null;
  const selectedModel = MODEL_OPTIONS.find((model) => model.id === route) ?? MODEL_OPTIONS[2];

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

  useEffect(() => {
    registerSubmit?.(() => {
      if (!draft.trim() && attachments.length === 0) return;
      (document.getElementById(promptFormId) as HTMLFormElement | null)?.requestSubmit();
    });
  }, [registerSubmit, draft, attachments.length, promptFormId]);

  useEffect(() => {
    registerApplyCommand?.((c: SlashCommand) => applySlash(c));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registerApplyCommand]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
  }, [draft, textareaRef]);

  const slashOpen = slash !== null && slash.length > 0;
  useEffect(() => {
    onSlashOpenChange?.(slashOpen);
  }, [slashOpen, onSlashOpenChange]);

  const lastHandled = useRef<SendMessageState>(null);
  useEffect(() => {
    if (state && state !== lastHandled.current) {
      lastHandled.current = state;
      if (state.ok) {
        const newId = state.conversationId;
        void Promise.resolve().then(() => {
          onDraftChange("");
          setPicked([]);
          setSlash(null);
          setCommand(null);
          setAttachments([]);
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

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        if (!file.type.startsWith("image/")) continue;
        const ticket = await createMarkUploadUrlAction(file.name, file.type);
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

  function submitComposer() {
    if (!draft.trim() && attachments.length === 0) return;
    if (voiceState === "listening") stopVoiceInput();
    if (demo) {
      onDemoSend?.(draft.trim());
      return;
    }

    const body = draft.trim() || "Shared an image for reference.";
    onOptimistic(tempMessage(conversationId, body, picked, attachments));

    const formData = new FormData();
    formData.set("conversationId", conversationId);
    formData.set("body", draft);
    formData.set("mentions", serializeMentions(picked));
    formData.set("mode", mode);
    formData.set("route", route);
    formData.set("command", command ?? "");
    formData.set("attachments", JSON.stringify(attachments));
    formData.set("projectId", newChatProjectId ?? "");
    startSubmitTransition(() => {
      formAction(formData);
    });
  }

  const projectItemCls = (active: boolean) =>
    cx(
      "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition hover:bg-white/7",
      active ? "font-semibold text-white" : "text-white/65 hover:text-white",
    );

  const busy = isPending || isDispatchPending;
  const composerStatus = replyPending ? "streaming" : busy ? "submitted" : state && !state.ok ? "error" : "ready";
  const disabled = busy || uploading || (!draft.trim() && attachments.length === 0);

  return (
    <div className="mx-auto w-full max-w-[59rem] px-4 pb-4 pt-2">
      <PromptInput
        id={promptFormId}
        onSubmit={() => submitComposer()}
        className={cx(
          "relative rounded-[1.75rem] bg-[#202020] pb-3 shadow-[0_24px_70px_rgba(0,0,0,0.32)]",
          "[&_[data-slot=input-group]]:h-auto [&_[data-slot=input-group]]:flex-col [&_[data-slot=input-group]]:items-stretch",
          "[&_[data-slot=input-group]]:overflow-visible [&_[data-slot=input-group]]:rounded-[1.75rem] [&_[data-slot=input-group]]:border-0",
          "[&_[data-slot=input-group]]:bg-[#202020] [&_[data-slot=input-group]]:shadow-none",
        )}
      >
        {query !== null && suggestions.length > 0 ? (
          <div className="absolute bottom-full left-0 right-0 z-30 mb-2 max-h-60 overflow-y-auto rounded-2xl border border-white/10 bg-[#2f2f2f] p-1.5 shadow-[0_18px_50px_rgba(0,0,0,0.45)]">
            {suggestions.map((m) => (
              <button key={`${m.type}:${m.id}`} type="button" onClick={() => addMention(m)} className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm text-white/72 transition hover:bg-white/7 hover:text-white">
                <span className="truncate font-semibold">{m.label}</span>
                <span className="font-mono text-[10px] uppercase text-white/35">{m.type}</span>
              </button>
            ))}
          </div>
        ) : null}

        {slash && slash.length > 0 ? (
          <div className="absolute bottom-full left-0 right-0 z-30 mb-2 max-h-60 overflow-y-auto rounded-2xl border border-white/10 bg-[#2f2f2f] p-1.5 shadow-[0_18px_50px_rgba(0,0,0,0.45)]">
            {slash.map((c) => (
              <button key={c.cmd} type="button" onClick={() => applySlash(c)} className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm transition hover:bg-white/7">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="font-mono text-xs font-bold text-[#ff8a3d]">{c.cmd}</span>
                  <span className="truncate text-white/72">{c.label}</span>
                </span>
                <span className="truncate text-xs text-white/35">{c.hint}</span>
              </button>
            ))}
          </div>
        ) : null}

        <div
          className={cx(
            "relative mx-0 flex w-full flex-col rounded-[1.65rem] bg-[#303030]",
            dragActive ? "shadow-[0_0_0_2px_rgba(255,138,61,0.45)]" : "",
          )}
          onDragOver={(e) => {
            if (Array.from(e.dataTransfer.types).includes("Files")) {
              e.preventDefault();
              setDragActive(true);
            }
          }}
          onDragLeave={(e) => {
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
        >
          {dragActive ? (
            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-[1.65rem] bg-[#303030]/90 text-sm font-semibold text-white backdrop-blur-sm">
              Drop image to attach
            </div>
          ) : null}

          {attachments.length > 0 || uploading ? (
            <div className="px-5 pt-4">
              <Attachments variant="inline" className="justify-start">
                {attachments.map((attachment) => (
                  <UploadedAttachment
                    key={attachment.objectPath}
                    attachment={attachment}
                    onRemove={(objectPath) => setAttachments((prev) => prev.filter((item) => item.objectPath !== objectPath))}
                  />
                ))}
                {uploading ? (
                  <span className="inline-flex h-8 items-center gap-2 rounded-md border border-white/10 px-2 text-sm text-white/55">
                    <Spinner /> Uploading
                  </span>
                ) : null}
              </Attachments>
            </div>
          ) : null}

          {command || picked.length > 0 ? (
            <div className="flex flex-wrap gap-1.5 px-5 pt-4">
              {command ? (
                <span className="inline-flex items-center gap-1 rounded-md bg-white/8 px-2 py-0.5 font-mono text-xs font-semibold text-white/75">
                  /{command}
                  <button type="button" aria-label="Remove command" onClick={() => setCommand(null)} className="text-white/35 transition hover:text-white">
                    <XIcon className="size-3" />
                  </button>
                </span>
              ) : null}
              {picked.map((m) => (
                <span key={`${m.type}:${m.id}`} className="inline-flex items-center gap-1 rounded-md bg-white/8 px-2 py-0.5 text-xs font-semibold text-white/75">
                  @{m.label}
                  <button type="button" aria-label={`Remove ${m.label}`} onClick={() => setPicked((prev) => prev.filter((p) => !(p.type === m.type && p.id === m.id)))} className="text-white/35 transition hover:text-white">
                    <XIcon className="size-3" />
                  </button>
                </span>
              ))}
            </div>
          ) : null}

          <PromptInputBody>
            <PromptInputTextarea
              ref={textareaRef}
              value={draft}
              aria-label={`Message ${assistantName}`}
              onChange={(e) => onTextChange(e.target.value)}
              onPaste={(e) => {
                const files = e.clipboardData?.files;
                if (files && files.length > 0 && Array.from(files).some((f) => f.type.startsWith("image/"))) {
                  e.preventDefault();
                  void handleFiles(files);
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && (query !== null || slash !== null)) {
                  e.preventDefault();
                }
              }}
              placeholder="Do anything"
              className="max-h-[220px] min-h-[84px] px-5 pb-2 pt-5 text-[15px] leading-6 text-white placeholder:text-white/30"
            />
          </PromptInputBody>

          <PromptInputFooter className="border-t-0 px-4 pb-3 pt-1">
            <div className="flex w-full min-w-0 items-center justify-between gap-3">
              <PromptInputTools className="min-w-0 gap-2">
                <PromptInputActionMenu>
                  <PromptInputActionMenuTrigger tooltip="Add attachment or command" className="size-8 rounded-full text-white/55 hover:bg-white/6 hover:text-white">
                    <PlusIcon className="size-5" />
                  </PromptInputActionMenuTrigger>
                  <PromptInputActionMenuContent className="border-white/10 bg-[#2f2f2f] text-white shadow-[0_18px_50px_rgba(0,0,0,0.45)]">
                    <PromptInputActionMenuItem onSelect={(event) => { event.preventDefault(); fileInputRef.current?.click(); }}>
                      <ImageIcon className="mr-2 size-4" /> Add image
                    </PromptInputActionMenuItem>
                    <PromptInputActionMenuItem onSelect={(event) => { event.preventDefault(); setSlash(SLASH_COMMANDS); textareaRef.current?.focus(); }}>
                      <SlidersHorizontalIcon className="mr-2 size-4" /> Commands
                    </PromptInputActionMenuItem>
                  </PromptInputActionMenuContent>
                </PromptInputActionMenu>
                <PillSelect ariaLabel="Mode" value={mode} options={MODE_OPTIONS} onChange={onModeChange} />
              </PromptInputTools>

              <PromptInputTools className="ml-auto shrink-0 gap-1.5">
                <ModelSelector open={modelSelectorOpen} onOpenChange={setModelSelectorOpen}>
                  <ModelSelectorTrigger asChild>
                    <PromptInputButton className="h-8 rounded-full px-2.5 text-sm text-white/70 hover:bg-white/5 hover:text-white" tooltip="Choose model">
                      <ModelSelectorLogo provider={selectedModel.chefSlug} />
                      <ModelSelectorName className="max-w-[7rem]">{selectedModel.shortName}</ModelSelectorName>
                    </PromptInputButton>
                  </ModelSelectorTrigger>
                  <ModelSelectorContent className="border-white/10 bg-[#242424] text-white">
                    <ModelSelectorInput placeholder="Search Claude models..." />
                    <ModelSelectorList>
                      <ModelSelectorEmpty>No models found.</ModelSelectorEmpty>
                      <ModelSelectorGroup heading="Anthropic">
                        {MODEL_OPTIONS.map((option) => (
                          <ModelOptionItem
                            key={option.id}
                            option={option}
                            selectedModel={route}
                            onSelect={(id) => {
                              onRouteChange(id);
                              setModelSelectorOpen(false);
                            }}
                          />
                        ))}
                      </ModelSelectorGroup>
                    </ModelSelectorList>
                  </ModelSelectorContent>
                </ModelSelector>

                <PromptInputButton
                  onClick={toggleVoiceInput}
                  disabled={voiceState === "checking" || voiceState === "unsupported" || busy}
                  aria-label={voiceState === "listening" ? "Stop voice input" : "Start voice input"}
                  aria-pressed={voiceState === "listening"}
                  tooltip={voiceState === "unsupported" ? "Voice input is not available in this browser" : voiceState === "listening" ? "Stop voice input" : "Speak a message"}
                  className={cx(
                    "size-8 rounded-full text-white/55 hover:bg-white/6 hover:text-white",
                    voiceState === "listening" ? "bg-white/10 text-white" : "",
                  )}
                >
                  <MicIcon className="size-4" />
                </PromptInputButton>

                <PromptInputSubmit
                  status={composerStatus}
                  onStop={onStopReply}
                  disabled={!replyPending && disabled}
                  className={cx(
                    "ml-1 size-9 rounded-full transition active:scale-95",
                    !replyPending && disabled ? "bg-white/20 text-white/45" : "bg-white/70 text-[#202020] hover:bg-white",
                  )}
                  size="icon-sm"
                  variant="ghost"
                >
                  {busy ? <Spinner /> : replyPending ? <SquareIcon className="size-4" /> : <ArrowUpIcon className="size-4" />}
                </PromptInputSubmit>
              </PromptInputTools>
            </div>
          </PromptInputFooter>
        </div>

        <div className="flex w-full flex-wrap items-center gap-3 px-5 pt-3 text-sm text-white/48">
          <div ref={projectWrapRef} className="relative">
            <button
              type="button"
              onClick={() => setProjectMenuOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={projectMenuOpen}
              className="flex h-8 items-center gap-2 rounded-full px-2 text-sm font-medium transition hover:bg-white/5 hover:text-white/75"
            >
              <FolderIcon className="size-4" />
              <span className="max-w-[12rem] truncate">{selectedProjectName ?? "marketing"}</span>
              <Glyph><path d="m6 8 4 4 4-4" /></Glyph>
            </button>
            {projectMenuOpen ? (
              <div role="menu" className="absolute bottom-full left-0 z-30 mb-2 max-h-56 w-60 overflow-y-auto rounded-xl border border-white/10 bg-[#2f2f2f] p-1.5 shadow-[0_18px_50px_rgba(0,0,0,0.45)]">
                <button type="button" role="menuitem" onClick={() => chooseProject(null)} className={projectItemCls(selectedProjectId === null)}>
                  marketing
                </button>
                {projects.map((p) => (
                  <button key={p.id} type="button" role="menuitem" onClick={() => chooseProject(p.id)} className={projectItemCls(selectedProjectId === p.id)}>
                    {p.name}
                  </button>
                ))}
                {projects.length === 0 ? <p className="px-2.5 py-2 text-xs text-white/40">No projects yet. Create one in the sidebar.</p> : null}
              </div>
            ) : null}
          </div>

          <span className="flex h-8 items-center gap-2 rounded-full px-2">
            <MonitorIcon className="size-4" />
            Work locally
            <Glyph><path d="m6 8 4 4 4-4" /></Glyph>
          </span>
          <span className="flex h-8 items-center gap-2 rounded-full px-2">
            <GitBranchIcon className="size-4" />
            main
            <Glyph><path d="m6 8 4 4 4-4" /></Glyph>
          </span>
        </div>

        <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={(e) => handleFiles(e.target.files)} className="hidden" />
      </PromptInput>

      {state && !state.ok ? <p className="mt-2 text-xs font-medium text-[var(--priority-bright)]">{state.message}</p> : null}
      {voiceError ? <p className="mt-2 text-xs font-medium text-[var(--text-muted)]">{voiceError}</p> : null}
    </div>
  );
}
