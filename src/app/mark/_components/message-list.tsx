"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

import { cx } from "@/app/_components/theme";
import type { MarkMessage, MarkStep } from "@/lib/mark-chat/persistence";

import { setMarkMessageFeedbackAction } from "../actions";
import { ActionCard } from "./action-card";
import { CampaignDeck } from "./campaign-deck";
import { MarkAvatar } from "./mark-avatar";
import { MessageMedia } from "./message-media";
import { SaveStar } from "./save-star";

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


function StepRow({ step, active, last }: { step: MarkStep; active?: boolean; last?: boolean }) {
  const done = step.status === "done";
  return (
    <div className="relative grid grid-cols-[1rem_1fr] items-start gap-3 pb-3.5 last:pb-0 motion-safe:[animation:msg-rise_.25s_ease-out]">
      {last ? null : <span aria-hidden className="absolute bottom-0 left-[0.45rem] top-4 w-px bg-[var(--border-hairline)]" />}
      <span
        aria-hidden
        className={cx(
          "z-[1] mt-0.5 flex h-[15px] w-[15px] items-center justify-center rounded-full bg-[var(--canvas)] shadow-[inset_0_0_0_1px_var(--border-strong)]",
          done ? "text-[var(--ok)] shadow-[inset_0_0_0_1px_var(--ok-border)]" : "",
          active ? "shadow-[inset_0_0_0_1px_var(--accent)]" : "",
        )}
      >
        {done ? (
          <svg viewBox="0 0 20 20" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M4 10.5l4 4 8-9" /></svg>
        ) : active ? (
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)] motion-safe:animate-pulse" />
        ) : null}
      </span>
      <div className="flex min-w-0 flex-col gap-1">
        <span className={cx("pt-px text-sm leading-snug", active ? "text-[var(--text-primary)]" : "text-[var(--text-secondary)]")}>{step.label}</span>
        {step.detail && step.detail.length > 0 ? (
          <ul className="flex flex-col gap-0.5">
            {step.detail.map((d, i) => (
              <li key={`${i}-${d}`} className="flex gap-1.5 text-[12px] leading-snug text-[var(--text-muted)]">
                <span aria-hidden className="select-none text-[var(--border-strong)]">–</span>
                <span className="min-w-0">{d}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}

function PendingBlock({ assistantName, steps, body, onStop }: { assistantName: string; steps: MarkStep[]; body: string; onStop: () => void }) {
  const elapsed = useElapsed(true);
  const hasSteps = steps.length > 0;
  const hasBody = body.trim().length > 0;
  return (
    <div className="flex flex-col gap-2">
      {hasSteps ? (
        <div className="flex flex-col" aria-label={`What ${assistantName} is doing`}>
          {steps.map((s, i) => (
            <StepRow
              key={`${i}-${s.label}`}
              step={s}
              active={s.status !== "done" && i === steps.length - 1}
              last={i === steps.length - 1}
            />
          ))}
        </div>
      ) : null}
      {hasBody ? (
        // Staged reply: the worker streams partial body text into the message
        // row; render it live with a bottom-fade mask + writing caret so chunked
        // updates read as continuous streaming rather than hard jumps.
        <div aria-label={`${assistantName} is writing`} className="mark-streaming">
          <MarkBody body={body} />
          <span aria-hidden className="mark-caret" />
        </div>
      ) : !hasSteps ? (
        <div className="flex flex-col gap-2.5" aria-label={`${assistantName} is thinking`}>
          <span className="flex items-center gap-2.5">
            <span aria-hidden className="mark-luma h-4 w-4">
              <span />
              <span />
            </span>
            <span className="mark-shimmer text-sm font-medium">{assistantName} is thinking...</span>
          </span>
          <div className="flex flex-col gap-2 pt-0.5">
            <div className="mark-skel" style={{ width: "92%" }} />
            <div className="mark-skel" style={{ width: "78%" }} />
            <div className="mark-skel" style={{ width: "85%" }} />
          </div>
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
    <details className="group mt-3">
      <summary className="flex cursor-pointer select-none items-center gap-1.5 text-[11px] font-medium text-[var(--text-muted)] transition hover:text-[var(--text-secondary)]">
        <svg viewBox="0 0 20 20" aria-hidden className="h-3.5 w-3.5 text-[var(--accent)]" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10 3l1.6 4.4L16 9l-4.4 1.6L10 15l-1.6-4.4L4 9l4.4-1.6z" />
        </svg>
        Chain of thought
        <span className="text-[var(--text-muted)]">· {steps.length} step{steps.length === 1 ? "" : "s"}</span>
        <svg viewBox="0 0 20 20" aria-hidden className="ml-0.5 h-3 w-3 transition-transform duration-200 group-open:rotate-180" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M6 8l4 4 4-4" /></svg>
      </summary>
      <div className="mt-2.5 flex flex-col pl-0.5">
        {steps.map((s, i) => (
          <StepRow key={`${i}-${s.label}`} step={{ ...s, status: "done" }} last={i === steps.length - 1} />
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
          className="inline-flex items-center rounded-md bg-[var(--surface-inset)] px-2 py-0.5 text-xs font-medium text-[var(--text-secondary)] shadow-[inset_0_0_0_1px_var(--border-strong)] transition hover:text-[var(--accent)]"
        >
          @{m.label}
        </Link>
      ))}
    </div>
  );
}

function References({ assistantName, mentions }: { assistantName: string; mentions: MarkMessage["mentions"] }) {
  if (mentions.length === 0) return null;
  return (
    <div className="mt-3">
      <p className="signal-eyebrow mb-1.5">Sources {assistantName} used</p>
      <div className="flex flex-wrap gap-1.5">
        {mentions.map((m) => (
          <Link
            key={`${m.type}:${m.id}`}
            href={m.href}
            className="inline-flex items-center rounded-md bg-[var(--surface-inset)] px-2 py-0.5 text-xs font-medium text-[var(--text-secondary)] shadow-[inset_0_0_0_1px_var(--border-strong)] transition hover:text-[var(--accent)]"
          >
            @{m.label}
          </Link>
        ))}
      </div>
    </div>
  );
}

/** Fenced code block with a language header bar and a copy button. */
function CodeBlock({ className, children }: { className?: string; children?: ReactNode }) {
  const lang = /language-(\w+)/.exec(className ?? "")?.[1] ?? "";
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLElement>(null);
  return (
    <div className="my-2 overflow-hidden rounded-lg border border-[var(--border-hairline)] bg-[var(--media-void)]">
      <div className="flex items-center justify-between border-b border-[var(--border-hairline)] px-3 py-1.5">
        <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--text-muted)]">{lang || "code"}</span>
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(ref.current?.innerText ?? "");
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            } catch {
              /* clipboard unavailable — ignore */
            }
          }}
          className="rounded px-1.5 py-0.5 text-[11px] font-semibold text-[var(--text-muted)] transition hover:text-[var(--text-primary)]"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="overflow-x-auto p-3 font-mono text-xs leading-5 text-[var(--text-secondary)]">
        <code ref={ref} className={className}>{children}</code>
      </pre>
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
  code: ({ className, children }) => {
    // Inline code has no language- class and no newline; render the small chip.
    if (!className && !String(children).includes("\n")) {
      return <code className="rounded bg-[var(--surface-inset)] px-1 py-0.5 font-mono text-[12px] text-[var(--text-primary)]">{children}</code>;
    }
    return <CodeBlock className={className}>{children}</CodeBlock>;
  },
  // Passthrough: CodeBlock renders its own <pre>, so don't double-wrap.
  pre: ({ children }) => <>{children}</>,
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

function SuggestionChips({ suggestions, onPick }: { suggestions: string[]; onPick: (prompt: string) => void }) {
  if (suggestions.length === 0) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-1.5" aria-label="Suggested next steps">
      {suggestions.map((s, i) => (
        <button
          key={`${i}-${s}`}
          type="button"
          onClick={() => onPick(s)}
          className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] shadow-[inset_0_0_0_1px_var(--border-hairline)] transition hover:text-[var(--text-primary)] hover:shadow-[inset_0_0_0_1px_var(--accent-border-strong)]"
        >
          <span aria-hidden className="text-[var(--accent)]">→</span>
          {s}
        </button>
      ))}
    </div>
  );
}

function markAvatarStateForMessageStatus(status: MarkMessage["status"]) {
  if (status === "pending") return "thinking";
  if (status === "failed") return "asleep";
  if (status === "complete") return "speaking";
  return "idle";
}

function Message({
  message,
  compact,
  assistantName,
  onRetry,
  onStop,
  onRegenerate,
  onSuggestion,
  onOpenAsset,
  onDecision,
}: {
  message: MarkMessage;
  compact: boolean;
  assistantName: string;
  onRetry: () => void;
  onStop: () => void;
  onRegenerate: (markMessageId: string) => void;
  onSuggestion: (prompt: string) => void;
  onOpenAsset?: (assetId?: string) => void;
  onDecision?: (assetId: string, decision: "approved" | "declined" | "revision") => void;
}) {
  // Operator: right-aligned bubble (ChatGPT-style), timestamp on hover.
  if (message.role === "operator") {
    return (
      <div className="group flex flex-col items-end">
        <div className="max-w-[82%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-[var(--surface-panel)] px-4 py-2.5 text-sm leading-6 text-[var(--text-primary)] shadow-[inset_0_0_0_1px_var(--border-strong)]">
          {message.body}
        </div>
        {message.attachments.length > 0 ? (
          <div className="mt-1.5 flex max-w-[82%] flex-wrap justify-end gap-1.5">
            {message.attachments.map((a) => (
              <a key={a.objectPath} href={a.url} target="_blank" rel="noreferrer" className="overflow-hidden rounded-lg shadow-[inset_0_0_0_1px_var(--border-strong)]">
                {/* eslint-disable-next-line @next/next/no-img-element -- signed GCS URL, no optimizer config */}
                <img src={a.url} alt={a.name} className="h-24 w-24 object-cover transition hover:opacity-90" />
              </a>
            ))}
          </div>
        ) : null}
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
  // A concept image attached to a draft is folded INTO the draft card (and into
  // the work canvas) rather than shown as a loose attachment below it — one
  // deliverable, not three scattered blocks. Any extra media still gets a gallery.
  const draftCards = message.actions.filter((a) => a.kind === "draft");
  const avatarState = markAvatarStateForMessageStatus(message.status);
  const isPackage = draftCards.length >= 2;
  const nonDraftCards = message.actions.filter((a) => a.kind !== "draft");
  const draftAction = draftCards[0];
  const cardImage = draftAction ? message.media.find((m) => m.kind === "image") : undefined;
  const galleryMedia = cardImage ? message.media.filter((m) => m !== cardImage) : message.media;
  return (
    <div className="group flex gap-3">
      {compact && !pending ? <span aria-hidden className="w-10 shrink-0" /> : <MarkAvatar size={42} state={avatarState} />}
      <div className="min-w-0 flex-1 pt-0.5">
        {compact && !pending ? null : (
          <div className="mb-1 flex items-baseline gap-2">
            <span style={{ fontFamily: "var(--font-serif)" }} className="text-[13px] font-semibold text-[var(--text-primary)]">{assistantName}</span>
            {!pending ? (
              <span className="text-[10px] tabular-nums text-[var(--text-muted)]" suppressHydrationWarning>
                {formatTime(message.createdAt)}
              </span>
            ) : null}
          </div>
        )}
        {pending ? (
          <PendingBlock assistantName={assistantName} steps={message.steps} body={message.body} onStop={onStop} />
        ) : failed ? (
          <div className="whitespace-pre-wrap text-sm leading-7 text-[var(--priority-bright)]">{message.body}</div>
        ) : (
          <MarkBody body={message.body} />
        )}
        {!pending && message.steps.length > 0 ? <StepTrace steps={message.steps} /> : null}
        {!pending && message.actions.length > 0 ? (
          isPackage ? (
            <>
              <CampaignDeck cards={draftCards} onOpenAsset={onOpenAsset} onDecision={onDecision} />
              {nonDraftCards.length > 0 ? (
                <div className="flex flex-col">
                  {nonDraftCards.map((card, i) => (
                    <ActionCard key={`${i}-${card.title}`} card={card} sourceConversationId={message.conversationId} sourceMessageId={message.id} />
                  ))}
                </div>
              ) : null}
            </>
          ) : (
            <div className="flex flex-col">
              {message.actions.map((card, i) => (
                <ActionCard
                  key={`${i}-${card.title}`}
                  card={card}
                  sourceConversationId={message.conversationId}
                  sourceMessageId={message.id}
                  image={card === draftAction ? cardImage : undefined}
                  onReview={card.kind === "draft" ? () => onOpenAsset?.(card.approval?.assetId) : undefined}
                />
              ))}
            </div>
          )
        ) : null}
        {!pending ? <References assistantName={assistantName} mentions={message.mentions} /> : null}
        {galleryMedia.length > 0 ? <MessageMedia media={galleryMedia} conversationId={message.conversationId} messageId={message.id} /> : null}
        {!pending && !failed ? <SuggestionChips suggestions={message.suggestions} onPick={onSuggestion} /> : null}
        {!pending ? (
          <div className="mt-1.5 flex items-center gap-1 text-[var(--text-muted)] opacity-70 transition group-hover:opacity-100 focus-within:opacity-100">
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
                <SaveStar
                  input={{
                    kind: "angle",
                    title: message.body.split("\n")[0].slice(0, 80),
                    body: message.body,
                    sourceConversationId: message.conversationId,
                    sourceMessageId: message.id,
                  }}
                  label="Save as angle"
                />
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
  assistantName = "Arc",
  onRetry,
  onStop,
  onRegenerate,
  onSuggestion,
  onOpenAsset,
  onDecision,
}: {
  messages: MarkMessage[];
  assistantName?: string;
  onRetry: () => void;
  onStop: () => void;
  onRegenerate: (markMessageId: string) => void;
  onSuggestion: (prompt: string) => void;
  onOpenAsset?: (assetId?: string) => void;
  onDecision?: (assetId: string, decision: "approved" | "declined" | "revision") => void;
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
        <div className="max-w-[48ch] text-center">
          <h2 style={{ fontFamily: "var(--font-serif)" }} className="text-2xl font-medium tracking-[-0.01em] text-[var(--text-primary)]">
            What should {assistantName} work on?
          </h2>
          <p className="mx-auto mt-3 text-sm leading-7 text-[var(--text-secondary)]">
            Ask about a campaign, a lead, or a persona. Type{" "}
            <span className="font-mono text-[var(--accent)]">@</span> to reference a record, or{" "}
            <span className="font-mono text-[var(--accent)]">/</span> for a command. {assistantName} drafts and recommends; outbound stays locked.
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
              <Message
                message={m}
                compact={compact}
                assistantName={assistantName}
                onRetry={onRetry}
                onStop={onStop}
                onRegenerate={onRegenerate}
                onSuggestion={onSuggestion}
                onOpenAsset={onOpenAsset}
                onDecision={onDecision}
              />
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
