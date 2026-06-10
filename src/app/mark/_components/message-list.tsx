"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

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

function PendingBlock({ steps, body, onStop }: { steps: MarkStep[]; body: string; onStop: () => void }) {
  const elapsed = useElapsed(true);
  const hasSteps = steps.length > 0;
  const hasBody = body.trim().length > 0;
  return (
    <div className="flex flex-col gap-2">
      {hasSteps ? (
        <div className="relative flex flex-col gap-1.5 border-l border-[var(--border-hairline)] pl-3" aria-label="What Mark is doing">
          {steps.map((s, i) => (
            <StepRow key={`${i}-${s.label}`} step={s} />
          ))}
        </div>
      ) : null}
      {hasBody ? (
        // Staged reply: the worker streams partial body text into the message
        // row; render it live with a writing caret instead of a placeholder.
        <div aria-label="Mark is writing">
          <MarkBody body={body} />
          <span
            aria-hidden
            className="mt-1 inline-block h-4 w-0.5 rounded-full bg-[var(--accent)] motion-safe:animate-pulse"
          />
        </div>
      ) : !hasSteps ? (
        <div className="flex flex-col gap-2" aria-label="Mark is working">
          <span className="mark-shimmer text-sm font-medium">Mark is thinking…</span>
          <div className="flex flex-col gap-2 pt-0.5">
            <div className="mark-shimmer-bar" style={{ width: "92%" }} />
            <div className="mark-shimmer-bar" style={{ width: "78%" }} />
            <div className="mark-shimmer-bar" style={{ width: "85%" }} />
          </div>
          <div className="mark-progress mt-0.5"><span /></div>
        </div>
      ) : null}
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
            <svg viewBox="0 0 20 20" aria-hidden className="h-3 w-3 shrink-0 text-[var(--accent)]" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 10.5l4 4 8-9" />
            </svg>
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

/** Mark replies render as markdown, mapped onto Signal tokens. */
const mdComponents: Components = {
  p: ({ children }) => <p className="text-sm leading-7 text-[var(--text-primary)]">{children}</p>,
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  em: ({ children }) => <em>{children}</em>,
  ul: ({ children }) => <ul className="flex list-disc flex-col gap-1 pl-5 text-sm leading-6 marker:text-[var(--text-muted)]">{children}</ul>,
  ol: ({ children }) => <ol className="flex list-decimal flex-col gap-1 pl-5 text-sm leading-6 marker:text-[var(--text-muted)]">{children}</ol>,
  li: ({ children }) => <li className="pl-0.5">{children}</li>,
  h1: ({ children }) => <h3 className="font-display text-base font-semibold tracking-[-0.01em] text-[var(--text-primary)]">{children}</h3>,
  h2: ({ children }) => <h3 className="font-display text-[15px] font-semibold tracking-[-0.01em] text-[var(--text-primary)]">{children}</h3>,
  h3: ({ children }) => <h4 className="font-display text-sm font-semibold text-[var(--text-primary)]">{children}</h4>,
  a: ({ href, children }) =>
    href?.startsWith("/") ? (
      <Link href={href} className="font-medium text-[var(--accent)] underline decoration-[var(--accent-border-strong)] underline-offset-2 hover:decoration-[var(--accent)]">
        {children}
      </Link>
    ) : (
      <a href={href} target="_blank" rel="noreferrer" className="font-medium text-[var(--accent)] underline decoration-[var(--accent-border-strong)] underline-offset-2 hover:decoration-[var(--accent)]">
        {children}
      </a>
    ),
  code: ({ children }) => (
    <code className="rounded bg-[var(--surface-inset)] px-1 py-0.5 font-mono text-[12px] text-[var(--text-primary)]">{children}</code>
  ),
  pre: ({ children }) => (
    <pre className="overflow-x-auto rounded-lg bg-[var(--media-void)] p-3 font-mono text-xs leading-5 text-[var(--text-secondary)] [&_code]:bg-transparent [&_code]:p-0">
      {children}
    </pre>
  ),
  blockquote: ({ children }) => (
    <blockquote className="border-l border-[var(--border-strong)] pl-3 text-[var(--text-secondary)]">{children}</blockquote>
  ),
  hr: () => <hr className="border-[var(--border-hairline)]" />,
  table: ({ children }) => (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border-b border-[var(--border-strong)] py-1.5 pr-4 font-semibold text-[var(--text-secondary)]">{children}</th>
  ),
  td: ({ children }) => <td className="border-b border-[var(--border-hairline)] py-1.5 pr-4 text-[var(--text-primary)]">{children}</td>,
};

function MarkBody({ body }: { body: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-2.5">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
        {body}
      </ReactMarkdown>
    </div>
  );
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function dayLabel(iso: string, nowMs: number): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date(nowMs);
  const today = now.toDateString();
  const yesterday = new Date(nowMs - 86_400_000).toDateString();
  if (d.toDateString() === today) return "Today";
  if (d.toDateString() === yesterday) return "Yesterday";
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: d.getFullYear() === now.getFullYear() ? undefined : "numeric",
  });
}

function DaySeparator({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3" aria-hidden suppressHydrationWarning>
      <span className="h-px flex-1 bg-[var(--border-hairline)]" />
      <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">{label}</span>
      <span className="h-px flex-1 bg-[var(--border-hairline)]" />
    </div>
  );
}

function Message({ message, compact, onRetry, onStop, onRegenerate }: { message: MarkMessage; compact: boolean; onRetry: () => void; onStop: () => void; onRegenerate: (markMessageId: string) => void }) {
  // Operator: right-aligned bubble (ChatGPT-style), timestamp on hover.
  if (message.role === "operator") {
    return (
      <div className="group flex flex-col items-end">
        <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-[var(--surface-inset)] px-4 py-2.5 text-sm leading-6 text-[var(--text-primary)]">
          {message.body}
        </div>
        <MentionChips mentions={message.mentions} align="end" />
        <span className="mt-1 pr-1 text-[10px] tabular-nums text-[var(--text-muted)] opacity-0 transition group-hover:opacity-100" suppressHydrationWarning>
          {formatTime(message.createdAt)}
        </span>
      </div>
    );
  }

  // Mark / system: full-width, avatar + name line + markdown body. Consecutive
  // Mark messages within a few minutes render compact (no repeated avatar/name).
  const pending = message.status === "pending";
  const failed = message.status === "failed";
  return (
    <div className="group flex gap-3">
      {compact && !pending ? <span aria-hidden className="w-7 shrink-0" /> : <MarkAvatar pending={pending} />}
      <div className="min-w-0 flex-1 pt-0.5">
        {compact && !pending ? null : (
          <div className="mb-1 flex items-baseline gap-2">
            <span className="font-display text-xs font-semibold text-[var(--text-secondary)]">Mark</span>
            {!pending ? (
              <span className="text-[10px] tabular-nums text-[var(--text-muted)]" suppressHydrationWarning>
                {formatTime(message.createdAt)}
              </span>
            ) : null}
          </div>
        )}
        {pending ? (
          <PendingBlock steps={message.steps} body={message.body} onStop={onStop} />
        ) : failed ? (
          <div className="whitespace-pre-wrap text-sm leading-7 text-[var(--priority-bright)]">{message.body}</div>
        ) : (
          <MarkBody body={message.body} />
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
  const scrollRef = useRef<HTMLDivElement>(null);
  // Follow new messages only while the reader is near the bottom; never yank
  // someone who scrolled up to re-read.
  const pinnedRef = useRef(true);
  const [pinned, setPinned] = useState(true);
  useEffect(() => {
    if (pinnedRef.current) endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);
  function onScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    pinnedRef.current = near;
    setPinned(near);
  }
  // Stable "now" per mount for day-separator labels (avoids Date.now in render).
  const [nowMs] = useState(() => Date.now());

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

  const rows = messages.map((m, i) => {
    const day = dayLabel(m.createdAt, nowMs);
    const prev = i > 0 ? messages[i - 1] : null;
    const prevDay = prev ? dayLabel(prev.createdAt, nowMs) : "";
    const showSeparator = day !== "" && day !== prevDay;
    const closeInTime = prev
      ? Math.abs(new Date(m.createdAt).getTime() - new Date(prev.createdAt).getTime()) < 5 * 60_000
      : false;
    const compact = !showSeparator && prev?.role === m.role && closeInTime;
    return { m, day, showSeparator, compact };
  });

  return (
    <div className="relative min-h-0 flex-1">
      <div ref={scrollRef} onScroll={onScroll} className="h-full overflow-y-auto">
        <div className="mx-auto flex w-full max-w-3xl flex-col px-4 py-6 sm:px-6">
          {rows.map(({ m, day, showSeparator, compact }, i) => (
            <div key={m.id} className={cx("msg-rise", i === 0 ? "" : compact ? "mt-2.5" : "mt-6")}>
              {showSeparator ? (
                <div className={i === 0 ? "mb-6" : "mb-6 mt-1"}>
                  <DaySeparator label={day} />
                </div>
              ) : null}
              <Message message={m} compact={compact} onRetry={onRetry} onStop={onStop} onRegenerate={onRegenerate} />
            </div>
          ))}
          <div ref={endRef} />
        </div>
      </div>
      {!pinned ? (
        <button
          type="button"
          onClick={() => endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" })}
          className="msg-rise absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-[var(--border-panel)] bg-[var(--surface-raised)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] shadow-[var(--elev-raised)] transition hover:bg-[var(--surface-inset)]"
        >
          Jump to latest
          <svg viewBox="0 0 20 20" aria-hidden className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10 4v11M5 11l5 5 5-5" />
          </svg>
        </button>
      ) : null}
    </div>
  );
}
