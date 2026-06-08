"use client";

import { useActionState, useEffect, useMemo, useRef, useState, type RefObject } from "react";

import { cx } from "@/app/_components/theme";
import type { MarkMention } from "@/domain";
import { serializeMentions } from "@/domain";
import type { MarkMessage } from "@/lib/mark-chat/persistence";
import type { MentionGroup } from "@/lib/mark-chat/mention-search";

import { sendMarkMessageAction, type SendMessageState } from "../actions";

function tempMessage(conversationId: string, body: string, mentions: MarkMention[]): MarkMessage {
  return {
    id: `temp-${Date.now()}`,
    conversationId,
    role: "operator",
    body,
    status: "sent",
    agentTaskId: null,
    mentions,
    media: [],
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
}: {
  conversationId: string;
  mentionGroups: MentionGroup[];
  draft: string;
  onDraftChange: (value: string) => void;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  onOptimistic: (message: MarkMessage) => void;
  onSent: (conversationId?: string) => void;
}) {
  const [state, formAction, isPending] = useActionState<SendMessageState, FormData>(sendMarkMessageAction, null);
  const [picked, setPicked] = useState<MarkMention[]>([]);
  const [query, setQuery] = useState<string | null>(null); // non-null when the @-popover is open
  const formRef = useRef<HTMLFormElement>(null);

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
    const match = /@([\w-]*)$/.exec(value);
    setQuery(match ? match[1] : null);
  }

  function addMention(m: MarkMention) {
    setPicked((prev) => (prev.some((p) => p.type === m.type && p.id === m.id) ? prev : [...prev, m]));
    onDraftChange(draft.replace(/@([\w-]*)$/, "").trimEnd() + " ");
    setQuery(null);
    textareaRef.current?.focus();
  }

  const disabled = isPending || !draft.trim();

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-4 pt-2">
      <form
        ref={formRef}
        action={formAction}
        className="relative"
        onSubmit={() => {
          if (!draft.trim()) return;
          onOptimistic(tempMessage(conversationId, draft.trim(), picked));
        }}
      >
        <input type="hidden" name="conversationId" value={conversationId} />
        <input type="hidden" name="body" value={draft} />
        <input type="hidden" name="mentions" value={serializeMentions(picked)} />

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

        <div className="flex flex-col gap-2 rounded-3xl border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-3 py-2.5 shadow-[var(--elev-panel)] transition duration-200 focus-within:border-[var(--accent)] focus-within:shadow-[var(--accent-soft-glow)]">
          {picked.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
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
            <textarea
              ref={textareaRef}
              name="body-display"
              value={draft}
              onChange={(e) => onTextChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && query === null) {
                  e.preventDefault();
                  if (!disabled) formRef.current?.requestSubmit();
                }
              }}
              rows={1}
              placeholder="Message Mark…"
              className="max-h-[200px] flex-1 resize-none bg-transparent px-1 py-1.5 text-sm leading-6 text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus-visible:outline-none"
            />
            <button
              type="submit"
              disabled={disabled}
              aria-label="Send message"
              className={cx(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition duration-200 ease-out",
                disabled
                  ? "cursor-not-allowed bg-[var(--surface-raised)] text-[var(--text-muted)]"
                  : "bg-[var(--accent)] text-[var(--on-accent)] hover:scale-[1.06] hover:bg-[var(--accent-strong)] active:scale-95",
              )}
            >
              {isPending ? <Spinner /> : <SendIcon />}
            </button>
          </div>
        </div>

        {state && !state.ok ? (
          <p className="mt-2 text-center text-xs font-semibold text-[var(--priority-bright)]">{state.message}</p>
        ) : (
          <p className="mt-2 text-center text-[11px] text-[var(--text-muted)]">
            Mark recommends; outbound stays locked. <span className="font-mono">@</span> to reference a record.
          </p>
        )}
      </form>
    </div>
  );
}
