"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

import { cx } from "@/app/_components/theme";
import type { MarkMessage, MarkStep } from "@/lib/mark-chat/persistence";

import { setMarkMessageFeedbackAction } from "../actions";
import { ActionCard } from "./action-card";
import { MessageMedia } from "./message-media";

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          /* clipboard unavailable — ignore */
        }
      }}
      className="rounded-md px-2 py-1 text-xs font-semibold text-[var(--text-muted)] transition hover:bg-[var(--surface-inset)] hover:text-[var(--text-primary)]"
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function FeedbackButtons({ messageId, current }: { messageId: string; current: "up" | "down" | null }) {
  const [value, setValue] = useState(current);
  function set(next: "up" | "down") {
    const v = value === next ? null : next;
    setValue(v);
    void setMarkMessageFeedbackAction(messageId, v);
  }
  const base = "rounded-md px-1.5 py-1 text-xs transition hover:bg-[var(--surface-inset)]";
  return (
    <span className="flex items-center gap-0.5">
      <button type="button" aria-label="Good reply" onClick={() => set("up")}
        className={cx(base, value === "up" ? "text-[var(--ok)]" : "text-[var(--text-muted)] hover:text-[var(--text-primary)]")}>
        <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M7 9l3-5a2 2 0 0 1 2 2v3h3.5a1.5 1.5 0 0 1 1.5 1.8l-1 5A1.5 1.5 0 0 1 14.5 17H7zm0 0H4v8h3z"/></svg>
      </button>
      <button type="button" aria-label="Bad reply" onClick={() => set("down")}
        className={cx(base, value === "down" ? "text-[var(--priority-bright)]" : "text-[var(--text-muted)] hover:text-[var(--text-primary)]")}>
        <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M13 11l-3 5a2 2 0 0 1-2-2v-3H4.5a1.5 1.5 0 0 1-1.5-1.8l1-5A1.5 1.5 0 0 1 5.5 3H13zm0 0h3V3h-3z"/></svg>
      </button>
    </span>
  );
}

function useElapsed(active: boolean): string {
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    if (!active) return;
    const start = Date.now();
    const t = setInterval(() => setSecs(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(t);
  }, [active]);
  const mm = String(Math.floor(secs / 60)).padStart(2, "0");
  const ss = String(secs % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

function MarkAvatar({ pending }: { pending?: boolean }) {
  return (
    <span
      aria-hidden
      className={cx(
        "flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] font-display text-xs font-bold text-[var(--on-accent)]",
        pending ? "motion-safe:[animation:avatar-breathe_1.8s_ease-in-out_infinite]" : "",
      )}
    >
      M
    </span>
  );
}

function StepRow({ step }: { step: MarkStep }) {
  const done = step.status === "done";
  return (
    <div className="flex items-center gap-2 text-sm motion-safe:[animation:msg-rise_.25s_ease-out]">
      {done ? (
        <svg viewBox="0 0 20 20" aria-hidden className="h-4 w-4 shrink-0 text-[var(--accent)]" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 10.5l4 4 8-9" />
        </svg>
      ) : (
        <span aria-hidden className="h-1.5 w-1.5 shrink-0 motion-safe:animate-pulse rounded-full bg-[var(--accent)]" />
      )}
      <span className={done ? "text-[var(--text-secondary)]" : "text-[var(--text-primary)]"}>{step.label}</span>
    </div>
  );
}

function PendingBlock({ steps, onStop }: { steps: MarkStep[]; onStop: () => void }) {
  const elapsed = useElapsed(true);
  const hasSteps = steps.length > 0;
  return (
    <div className="flex flex-col gap-2">
      {hasSteps ? (
        <div className="relative flex flex-col gap-1.5 border-l border-[var(--border-hairline)] pl-3" aria-label="What Mark is doing">
          {steps.map((s, i) => (
            <StepRow key={`${i}-${s.label}`} step={s} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-2" aria-label="Mark is working">
          <span className="mark-shimmer text-sm font-medium">Mark is thinking…</span>
          <div className="flex flex-col gap-2 pt-0.5">
            <div className="mark-shimmer-bar" style={{ width: "92%" }} />
            <div className="mark-shimmer-bar" style={{ width: "78%" }} />
            <div className="mark-shimmer-bar" style={{ width: "85%" }} />
          </div>
          <div className="mark-progress mt-0.5"><span /></div>
        </div>
      )}
      <div className="flex items-center gap-3 text-xs text-[var(--text-muted)]">
        <span className="tabular-nums">{elapsed}</span>
        <button
          type="button"
          onClick={onStop}
          className="rounded-md border border-[var(--border-hairline)] px-2 py-0.5 font-semibold transition hover:border-[var(--priority-bright)] hover:text-[var(--priority-bright)]"
        >
          Stop
        </button>
      </div>
    </div>
  );
}

function StepTrace({ steps }: { steps: MarkStep[] }) {
  return (
    <details className="mt-2 text-xs text-[var(--text-muted)]">
      <summary className="cursor-pointer select-none hover:text-[var(--text-secondary)]">Show what Mark did</summary>
      <div className="mt-1.5 flex flex-col gap-1 pl-1">
        {steps.map((s, i) => (
          <div key={`${i}-${s.label}`} className="flex items-center gap-2">
            <span aria-hidden className="text-[var(--accent)]">✓</span>
            <span>{s.label}</span>
          </div>
        ))}
      </div>
    </details>
  );
}

function MentionChips({ mentions, align }: { mentions: MarkMessage["mentions"]; align?: "end" }) {
  if (mentions.length === 0) return null;
  return (
    <div className={cx("mt-2 flex flex-wrap gap-1.5", align === "end" ? "justify-end" : "")}>
      {mentions.map((m) => (
        <Link
          key={`${m.type}:${m.id}`}
          href={m.href}
          className="inline-flex items-center rounded-md border border-[var(--accent-border-strong)] bg-[var(--accent-soft)] px-2 py-0.5 text-xs font-semibold text-[var(--accent-contrast)] transition hover:bg-[var(--surface-raised)]"
        >
          @{m.label}
        </Link>
      ))}
    </div>
  );
}

function References({ mentions }: { mentions: MarkMessage["mentions"] }) {
  if (mentions.length === 0) return null;
  return (
    <div className="mt-3">
      <p className="signal-eyebrow mb-1.5">References</p>
      <div className="flex flex-wrap gap-1.5">
        {mentions.map((m) => (
          <Link
            key={`${m.type}:${m.id}`}
            href={m.href}
            className="inline-flex items-center rounded-md border border-[var(--accent-border-strong)] bg-[var(--accent-soft)] px-2 py-0.5 text-xs font-semibold text-[var(--accent-contrast)] transition hover:bg-[var(--surface-raised)]"
          >
            @{m.label}
          </Link>
        ))}
      </div>
    </div>
  );
}

function Message({ message, onRetry, onStop, onRegenerate }: { message: MarkMessage; onRetry: () => void; onStop: () => void; onRegenerate: (markMessageId: string) => void }) {
  // Operator: right-aligned bubble (ChatGPT-style).
  if (message.role === "operator") {
    return (
      <div className="flex flex-col items-end">
        <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-[var(--surface-inset)] px-4 py-2.5 text-sm leading-6 text-[var(--text-primary)]">
          {message.body}
        </div>
        <MentionChips mentions={message.mentions} align="end" />
      </div>
    );
  }

  // Mark / system: full-width, avatar + plain text.
  const pending = message.status === "pending";
  const failed = message.status === "failed";
  return (
    <div className="group flex gap-3">
      <MarkAvatar pending={pending} />
      <div className="min-w-0 flex-1 pt-0.5">
        {pending ? (
          <PendingBlock steps={message.steps} onStop={onStop} />
        ) : (
          <div
            className={cx(
              "whitespace-pre-wrap text-sm leading-7",
              failed ? "text-[var(--priority-bright)]" : "text-[var(--text-primary)]",
            )}
          >
            {message.body}
          </div>
        )}
        {!pending && message.steps.length > 0 ? <StepTrace steps={message.steps} /> : null}
        {!pending && message.actions.length > 0 ? (
          <div className="flex flex-col">
            {message.actions.map((card, i) => (
              <ActionCard key={`${i}-${card.title}`} card={card} />
            ))}
          </div>
        ) : null}
        {!pending ? <References mentions={message.mentions} /> : null}
        {message.media.length > 0 ? <MessageMedia media={message.media} /> : null}
        {!pending ? (
          <div className="mt-1.5 flex items-center gap-1 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
            {failed ? (
              <button
                type="button"
                onClick={onRetry}
                className="rounded-md px-2 py-1 text-xs font-semibold text-[var(--accent-contrast)] transition hover:bg-[var(--surface-inset)]"
              >
                Retry
              </button>
            ) : (
              <>
                <CopyButton text={message.body} />
                <button
                  type="button"
                  onClick={() => onRegenerate(message.id)}
                  className="rounded-md px-2 py-1 text-xs font-semibold text-[var(--text-muted)] transition hover:bg-[var(--surface-inset)] hover:text-[var(--text-primary)]"
                >
                  Regenerate
                </button>
                <FeedbackButtons messageId={message.id} current={message.feedback} />
              </>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function MessageList({
  messages,
  onRetry,
  onStop,
  onRegenerate,
}: {
  messages: MarkMessage[];
  onRetry: () => void;
  onStop: () => void;
  onRegenerate: (markMessageId: string) => void;
}) {
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto px-4">
        <div className="text-center">
          <h2 className="font-display text-2xl font-bold tracking-[-0.03em] text-[var(--text-primary)]">
            What can Mark help with?
          </h2>
          <p className="mx-auto mt-3 max-w-[46ch] text-sm leading-6 text-[var(--text-secondary)]">
            Ask about a campaign, a lead, or a persona. Type{" "}
            <span className="font-mono text-[var(--accent)]">@</span> to reference a record. Mark recommends; outbound
            stays locked.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6">
        {messages.map((m) => (
          <div key={m.id} className="msg-rise">
            <Message message={m} onRetry={onRetry} onStop={onStop} onRegenerate={onRegenerate} />
          </div>
        ))}
        <div ref={endRef} />
      </div>
    </div>
  );
}
