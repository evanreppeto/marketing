"use client";

import { useActionState, useEffect, useMemo, useRef, useState, type RefObject } from "react";

import { cx } from "@/app/_components/theme";
import type { MarkMention } from "@/domain";
import { serializeMentions } from "@/domain";
import { matchSlash, type SlashCommand } from "./slash-commands";
import type { MarkAttachment, MarkMessage } from "@/lib/mark-chat/persistence";
import type { MentionGroup } from "@/lib/mark-chat/mention-search";

import { createMarkUploadUrlAction, sendMarkMessageAction, type SendMessageState } from "../actions";

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
}: {
  conversationId: string;
  mentionGroups: MentionGroup[];
  draft: string;
  onDraftChange: (value: string) => void;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  onOptimistic: (message: MarkMessage) => void;
  onSent: (conversationId?: string) => void;
  registerSubmit?: (fn: () => void) => void;
  registerApplyCommand?: (fn: (cmd: SlashCommand) => void) => void;
}) {
  const [state, formAction, isPending] = useActionState<SendMessageState, FormData>(sendMarkMessageAction, null);
  const [picked, setPicked] = useState<MarkMention[]>([]);
  const [query, setQuery] = useState<string | null>(null); // non-null when the @-popover is open
  const [slash, setSlash] = useState<SlashCommand[] | null>(null); // non-null when the /-popover is open
  const [command, setCommand] = useState<string | null>(null); // structured command attached to the next send
  const [attachments, setAttachments] = useState<MarkAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

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

  const disabled = isPending || uploading || (!draft.trim() && attachments.length === 0);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-4 pt-2">
      <form
        ref={formRef}
        action={formAction}
        className="relative"
        onSubmit={() => {
          if (!draft.trim() && attachments.length === 0) return;
          onOptimistic(tempMessage(conversationId, draft.trim() || "Shared an image for reference.", picked, attachments));
        }}
      >
        <input type="hidden" name="conversationId" value={conversationId} />
        <input type="hidden" name="body" value={draft} />
        <input type="hidden" name="mentions" value={serializeMentions(picked)} />
        {/* Mode selector removed — the approval + policy gates are the real guardrails.
            Default stance "act"; the agent infers intent and the gate enforces limits. */}
        <input type="hidden" name="mode" value="act" />
        <input type="hidden" name="command" value={command ?? ""} />
        <input type="hidden" name="attachments" value={JSON.stringify(attachments)} />

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

        <div className="flex flex-col gap-2 rounded-2xl border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-3 py-2.5 shadow-[var(--elev-panel)] transition duration-200 focus-within:border-[var(--accent)]">
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

          <div className="flex items-end gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              aria-label="Attach image"
              title="Attach a reference image"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[var(--text-muted)] transition hover:bg-[var(--surface-raised)] hover:text-[var(--text-primary)] disabled:opacity-50"
            >
              <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4.5" width="14" height="11" rx="2" />
                <circle cx="7.5" cy="9" r="1.4" />
                <path d="M4 14l3.5-3.5 2.5 2.5 2-2 4 4" />
              </svg>
            </button>
            <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={(e) => handleFiles(e.target.files)} className="hidden" />
            <textarea
              ref={textareaRef}
              name="body-display"
              value={draft}
              onChange={(e) => onTextChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && query === null && slash === null) {
                  e.preventDefault();
                  if (!disabled) formRef.current?.requestSubmit();
                }
              }}
              rows={1}
              placeholder="Message Mark…"
              style={{ outline: "none" }}
              className="max-h-[200px] flex-1 resize-none bg-transparent px-1 py-1.5 text-sm leading-6 text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
            />
            <button
              type="submit"
              disabled={disabled}
              aria-label="Send message"
              className={cx(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition duration-200 ease-out",
                disabled
                  ? "cursor-not-allowed bg-[var(--surface-raised)] text-[var(--text-muted)]"
                  : "bg-[var(--accent)] text-[var(--on-accent)] hover:bg-[var(--accent-strong)] active:scale-95",
              )}
            >
              {isPending ? <Spinner /> : <SendIcon />}
            </button>
          </div>
        </div>

        {state && !state.ok ? (
          <p className="mt-2 text-xs font-medium text-[var(--priority-bright)]">{state.message}</p>
        ) : (
          <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-1 text-[11px] text-[var(--text-muted)]">
            <p className="hidden flex-wrap gap-x-3 sm:flex">
              <span><span className="font-mono">↵</span> send</span>
              <span><span className="font-mono">⇧↵</span> newline</span>
              <span><span className="font-mono">@</span> records</span>
              <span><span className="font-mono">/</span> commands</span>
            </p>
            <span className="ml-auto flex items-center gap-1">
              <svg viewBox="0 0 20 20" aria-hidden className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.8">
                <rect x="5" y="9" width="10" height="7" rx="1.5" />
                <path d="M7 9V7a3 3 0 0 1 6 0v2" />
              </svg>
              outbound stays locked
            </span>
          </div>
        )}
      </form>
    </div>
  );
}
