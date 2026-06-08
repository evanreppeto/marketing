"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/app/_components/page-header";
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
    createdAt: new Date().toISOString(),
  };
}

export function Composer({
  conversationId,
  mentionGroups,
  onOptimistic,
  onSent,
}: {
  conversationId: string;
  mentionGroups: MentionGroup[];
  onOptimistic: (message: MarkMessage) => void;
  onSent: (conversationId?: string) => void;
}) {
  const [state, formAction, isPending] = useActionState<SendMessageState, FormData>(sendMarkMessageAction, null);
  const [text, setText] = useState("");
  const [picked, setPicked] = useState<MarkMention[]>([]);
  const [query, setQuery] = useState<string | null>(null); // non-null when the @-popover is open
  const formRef = useRef<HTMLFormElement>(null);

  // Notify parent when a send completes.
  const lastHandled = useRef<SendMessageState>(null);
  useEffect(() => {
    if (state && state !== lastHandled.current) {
      lastHandled.current = state;
      if (state.ok) {
        const conversationId = state.conversationId;
        // Schedule setState asynchronously to satisfy the set-state-in-effect lint rule.
        void Promise.resolve().then(() => {
          setText("");
          setPicked([]);
          onSent(conversationId);
        });
      }
    }
  }, [state, onSent]);

  const suggestions = useMemo(() => {
    if (query === null) return [];
    const q = query.toLowerCase();
    const flat = mentionGroups.flatMap((g) => g.items);
    return flat.filter((m) => m.label.toLowerCase().includes(q)).slice(0, 8);
  }, [query, mentionGroups]);

  function onTextChange(value: string) {
    setText(value);
    const match = /@([\w-]*)$/.exec(value);
    setQuery(match ? match[1] : null);
  }

  function addMention(m: MarkMention) {
    setPicked((prev) => (prev.some((p) => p.type === m.type && p.id === m.id) ? prev : [...prev, m]));
    setText((prev) => prev.replace(/@([\w-]*)$/, "").trimEnd() + " ");
    setQuery(null);
  }

  const disabled = isPending || !text.trim();

  return (
    <form
      ref={formRef}
      action={formAction}
      className="relative border-t border-[var(--border-hairline)] p-3"
      onSubmit={() => {
        if (!text.trim()) return;
        onOptimistic(tempMessage(conversationId, text.trim(), picked));
      }}
    >
      <input type="hidden" name="conversationId" value={conversationId} />
      <input type="hidden" name="body" value={text} />
      <input type="hidden" name="mentions" value={serializeMentions(picked)} />

      {picked.length > 0 ? (
        <div className="mb-2 flex flex-wrap gap-1.5">
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
                className="text-[var(--text-muted)] hover:text-[var(--priority-bright)]"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      ) : null}

      {query !== null && suggestions.length > 0 ? (
        <div className="absolute bottom-full left-3 right-3 mb-2 max-h-60 overflow-y-auto rounded-lg border border-[var(--border-panel)] bg-[var(--surface-raised)] p-1 shadow-[var(--elev-raised)]">
          {suggestions.map((m) => (
            <button
              key={`${m.type}:${m.id}`}
              type="button"
              onClick={() => addMention(m)}
              className="flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-sm transition hover:bg-[var(--surface-inset)]"
            >
              <span className="truncate font-semibold text-[var(--text-primary)]">{m.label}</span>
              <span className="font-mono text-[10px] uppercase text-[var(--text-muted)]">{m.type}</span>
            </button>
          ))}
        </div>
      ) : null}

      <div className="flex items-end gap-2">
        <textarea
          name="body-display"
          value={text}
          onChange={(e) => onTextChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && query === null) {
              e.preventDefault();
              if (!disabled) formRef.current?.requestSubmit();
            }
          }}
          rows={2}
          placeholder="Ask Mark…  (type @ to reference a record)"
          className={cx(
            "min-h-11 flex-1 resize-none rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-inset)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]",
          )}
        />
        <Button type="submit" variant="primary" size="md" disabled={disabled}>
          {isPending ? "Sending…" : "Send"}
        </Button>
      </div>

      {state && !state.ok ? (
        <p className="mt-2 text-xs font-semibold text-[var(--priority-bright)]">{state.message}</p>
      ) : null}
    </form>
  );
}
