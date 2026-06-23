"use client";

import { memo, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import ReactArcdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

import { cx } from "@/app/_components/theme";
import { stepGlyphKind, summarizeSteps, normalizeArcBody } from "@/domain";
import type { ArcMessage, ArcStep, ArcToolCall } from "@/lib/arc-chat/persistence";
import { attachmentKind } from "@/lib/arc-chat/attachment-types";

import { WorkGlyph } from "./work-glyph";

import { setArcMessageFeedbackAction } from "../actions";
import { ActionCard } from "./action-card";
import { CampaignDeck } from "./campaign-deck";
import { ArcAvatar } from "./arc-avatar";
import { MessageMedia } from "./message-media";
import { SaveStar } from "./save-star";
import {
  ChainOfThought,
  ChainOfThoughtContent,
  ChainOfThoughtHeader,
  ChainOfThoughtStep,
} from "@/components/ai-elements/chain-of-thought";
import { Sources, SourcesContent, SourcesTrigger } from "@/components/ai-elements/sources";
import { Reasoning, ReasoningContent, ReasoningTrigger } from "@/components/ai-elements/reasoning";
import { ToolTraces } from "./tool-trace";

/** Shared affordance for the icon-only reply action row (copy, regenerate). */
const ICON_ACTION =
  "flex h-7 w-7 items-center justify-center rounded-md text-[var(--text-muted)] transition hover:bg-[var(--surface-inset)] hover:text-[var(--text-primary)]";

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      aria-label={copied ? "Copied" : "Copy reply"}
      title={copied ? "Copied" : "Copy"}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          /* clipboard unavailable — ignore */
        }
      }}
      className={ICON_ACTION}
    >
      {copied ? (
        <svg viewBox="0 0 20 20" className="h-4 w-4 text-[var(--ok)]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m5 10 3.5 3.5L15 6.5" /></svg>
      ) : (
        <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="7" y="7" width="9" height="9" rx="2" /><path d="M13 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2" /></svg>
      )}
    </button>
  );
}

function FeedbackButtons({ messageId, current }: { messageId: string; current: "up" | "down" | null }) {
  const [value, setValue] = useState(current);
  function set(next: "up" | "down") {
    const v = value === next ? null : next;
    setValue(v);
    void setArcMessageFeedbackAction(messageId, v);
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

/**
 * True once `signature` has gone unchanged for `ms` — i.e. a pending reply has
 * stopped producing new text/steps. Used to detect a worker that died mid-run
 * (Cloud Run SIGTERM, dropped task) so we can surface a retry instead of
 * spinning "thinking…" forever. Non-destructive: we never auto-fail a possibly
 * still-alive reply, we just offer the option. Resets on every advance.
 */
function useStalled(signature: string, ms: number): boolean {
  const [stalled, setStalled] = useState(false);
  useEffect(() => {
    // Reset + re-arm via timers so we never setState directly in the effect body.
    const reset = setTimeout(() => setStalled(false), 0);
    const arm = setTimeout(() => setStalled(true), ms);
    return () => {
      clearTimeout(reset);
      clearTimeout(arm);
    };
  }, [signature, ms]);
  return stalled;
}

/**
 * Typewriter reveal for streamed text. The worker streams `body` into the
 * message row in ~2–3s poll chunks; this advances the visible substring toward
 * the latest `body` at a steady rate so it reads as continuous typing rather
 * than hard jumps. Catches up gently when a big chunk lands so it never lags
 * more than ~1s behind. Returns the full text immediately when not streaming.
 */
const TYPE_CPS = 110; // baseline characters per second
function useTypewriter(target: string, streaming: boolean): string {
  const [len, setLen] = useState(streaming ? 0 : target.length);
  // Refs mirror the latest target/len for the interval; synced in effects (not
  // during render) so we never read/write refs while rendering.
  const targetRef = useRef(target);
  const lenRef = useRef(len);
  useEffect(() => {
    targetRef.current = target;
  }, [target]);
  useEffect(() => {
    lenRef.current = len;
  }, [len]);

  useEffect(() => {
    if (!streaming) {
      setLen(targetRef.current.length);
      return;
    }
    let last = Date.now();
    let carry = 0;
    const id = setInterval(() => {
      const full = targetRef.current.length;
      let cur = lenRef.current;
      // Target shrank (regenerate / thread switch) — clamp so we resume typing
      // from the new end rather than waiting for it to catch back up.
      if (cur > full) {
        cur = full;
        lenRef.current = full;
        setLen(full);
      }
      if (cur >= full) {
        last = Date.now();
        return;
      }
      const now = Date.now();
      carry += ((now - last) / 1000) * TYPE_CPS;
      last = now;
      let add = Math.floor(carry);
      carry -= add;
      // Clear a backlog faster so the caret never trails far behind the worker.
      const remaining = full - cur;
      if (remaining > 140) add += Math.ceil((remaining - 140) / 12);
      if (add < 1) add = 1;
      const next = Math.min(full, cur + add);
      lenRef.current = next;
      setLen(next);
    }, 33);
    return () => clearInterval(id);
  }, [streaming]);

  return target.slice(0, len);
}


/**
 * Renders Arc's step trace using the AI Elements ChainOfThought component.
 * Maps our ArcStep data: status "done" -> complete, "running" -> active.
 * `detail` lines render as sub-text under the step.
 */
function ChainOfThoughtTrace({
  steps,
  title,
  defaultOpen,
}: {
  steps: ArcStep[];
  title: ReactNode;
  defaultOpen?: boolean;
}) {
  if (steps.length === 0) return null;
  return (
    <ChainOfThought defaultOpen={defaultOpen}>
      <ChainOfThoughtHeader>{title}</ChainOfThoughtHeader>
      <ChainOfThoughtContent>
        {steps.map((s, i) => (
          <ChainOfThoughtStep
            key={`${i}-${s.label}`}
            label={s.label}
            status={s.status === "done" ? "complete" : "active"}
          >
            {s.detail && s.detail.length > 0 ? (
              <div className="space-y-0.5 text-[var(--text-muted)] text-xs">
                {s.detail.map((d, j) => (
                  <div key={`${j}-${d}`}>– {d}</div>
                ))}
              </div>
            ) : null}
          </ChainOfThoughtStep>
        ))}
      </ChainOfThoughtContent>
    </ChainOfThought>
  );
}

/** Split a step label into [firstWord, rest] so the verb can carry the serif. */
function firstWordSplit(label: string): [string, string] {
  const trimmed = label.trim();
  const i = trimmed.indexOf(" ");
  if (i === -1) return [trimmed, ""];
  return [trimmed.slice(0, i), trimmed.slice(i)];
}

/** Compact a completed-step label for the breadcrumb (keeps it to one line). */
function shortLabel(label: string): string {
  const head = label.split(" — ")[0].split(", ")[0].trim();
  return head.length > 28 ? `${head.slice(0, 27)}…` : head;
}

/**
 * Live "thinking" step spine shown while Arc works (calm register, à la
 * Claude/ChatGPT). The animated Persona avatar carries the personality, so the
 * body stays quiet: completed steps check off on a hairline spine that fills
 * gold as it goes, and the current step's label shimmers. Now lives behind the
 * `Show steps` toggle on the in-flight `ThinkingLine`; the finished message
 * keeps the collapsible ChainOfThought trace (`StepTrace`).
 */
function ThinkingTrace({ steps, assistantName }: { steps: ArcStep[]; assistantName: string }) {
  if (steps.length === 0) return null;
  return (
    <div role="status" aria-live="polite" aria-label={`${assistantName} is thinking`} className="flex flex-col">
      {steps.map((s, i) => {
        const done = s.status === "done";
        const isLast = i === steps.length - 1;
        return (
          <div key={`${i}-${s.label}`} className="msg-rise flex gap-2.5">
            <div className="flex flex-col items-center">
              {done ? (
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-[var(--accent-soft)]">
                  <WorkGlyph kind={stepGlyphKind(s)} className="h-3 w-3 text-[var(--accent)]" />
                </span>
              ) : (
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-[var(--accent)]">
                  <WorkGlyph kind={stepGlyphKind(s)} className="h-3 w-3 text-[var(--accent)]" />
                </span>
              )}
              {!isLast ? (
                <span className={cx("my-1 w-px flex-1", done ? "bg-[var(--accent-border)]" : "bg-[var(--border-hairline)]")} />
              ) : null}
            </div>
            <div className={cx("min-w-0 flex-1", isLast ? "" : "pb-3")}>
              <div className={cx("text-[13px] leading-5", done ? "text-[var(--text-muted)]" : "text-[var(--text-primary)]")}>
                {done ? s.label : <span className="arc-shimmer font-medium">{s.label}</span>}
              </div>
              {s.detail && s.detail.length > 0 ? (
                <div className="mt-1 space-y-0.5 text-xs text-[var(--text-muted)]">
                  {s.detail.map((d, j) => (
                    <div key={`${j}-${d}`}>– {d}</div>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Arc's narrative thinking, via the AI Elements Reasoning component (collapsible
 *  "Thought for Ns", matching the chain-of-thought treatment already in use). */
function ArcReasoning({ text, streaming = false }: { text: string; streaming?: boolean }) {
  return (
    <div className="mt-3">
      <Reasoning isStreaming={streaming}>
        <ReasoningTrigger />
        <ReasoningContent>{text}</ReasoningContent>
      </Reasoning>
    </div>
  );
}

/**
 * Calm in-flight status: one line carrying a work glyph + serif verb for the
 * current step, a quiet breadcrumb of completed phases, and a Show/Hide steps
 * toggle. The full spine + reasoning + tools live behind the toggle.
 */
function ThinkingLine({
  steps,
  expanded,
  onToggle,
}: {
  steps: ArcStep[];
  expanded: boolean;
  onToggle: () => void;
}) {
  // Collapse repeated work into counted groups so 46 "Creating lead for X" steps
  // read as one calm "Creating lead · 26" line, not a stress-wall of chips.
  const { groups } = summarizeSteps(steps);
  const current = groups[groups.length - 1];
  const done = groups.slice(0, -1);
  const [verb, rest] = firstWordSplit(current.title);
  const countLabel = current.count > 1 ? ` · ${current.count}` : "";
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2.5">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[var(--accent-soft)]">
          <WorkGlyph kind={current.kind} className="h-3.5 w-3.5 text-[var(--accent)]" />
        </span>
        <span className="min-w-0 flex-1 text-sm leading-5">
          <span style={{ fontFamily: "var(--font-serif)" }} className="italic text-[var(--text-secondary)]">
            {verb}
          </span>
          {rest ? <span className="arc-shimmer font-medium">{rest}</span> : null}
          {countLabel ? <span className="font-medium tabular-nums text-[var(--text-secondary)]">{countLabel}</span> : null}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 pl-[2.125rem] text-[11px] text-[var(--text-muted)]">
        {done.map((g, i) => (
          <span key={`${i}-${g.title}`} className="flex items-center gap-1.5">
            {i > 0 ? <span aria-hidden className="opacity-40">→</span> : null}
            <span>
              {shortLabel(g.title)}
              {g.count > 1 ? <span className="tabular-nums opacity-70"> ·{g.count}</span> : null}
            </span>
          </span>
        ))}
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          className="ml-1 rounded-md border border-[var(--border-hairline)] px-1.5 py-0.5 font-medium transition hover:text-[var(--text-primary)]"
        >
          {expanded ? "Hide steps" : "Show steps"}
        </button>
      </div>
    </div>
  );
}

function PendingBlock({
  assistantName,
  steps,
  body,
  reasoning,
  toolCalls,
  onStop,
  onRetry,
}: {
  assistantName: string;
  steps: ArcStep[];
  body: string;
  reasoning: string | null;
  toolCalls: ArcToolCall[];
  onStop: () => void;
  onRetry: () => void;
}) {
  const elapsed = useElapsed(true);
  // Reveal streamed text character-by-character so chunked poll updates read as
  // continuous typing rather than hard jumps.
  const typed = useTypewriter(body, true);
  const hasSteps = steps.length > 0;
  const hasBody = body.trim().length > 0;
  // If nothing has advanced for a while, the worker likely died — offer a retry
  // instead of an endless spinner. Signature covers every live surface so any
  // real progress resets the timer.
  const progressSignature = `${body.length}|${steps.length}|${steps[steps.length - 1]?.status ?? ""}|${(reasoning ?? "").length}|${toolCalls.length}`;
  const stalled = useStalled(progressSignature, 90_000);
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="flex flex-col gap-2.5">
      {hasSteps ? (
        <>
          <ThinkingLine steps={steps} expanded={expanded} onToggle={() => setExpanded((v) => !v)} />
          {expanded ? (
            <div className="border-l border-[var(--border-hairline)] pl-3.5">
              <ThinkingTrace steps={steps} assistantName={assistantName} />
              {reasoning ? <ArcReasoning text={reasoning} streaming /> : null}
              {toolCalls.length > 0 ? <ToolTraces tools={toolCalls} /> : null}
            </div>
          ) : null}
        </>
      ) : (
        <>
          {reasoning ? <ArcReasoning text={reasoning} streaming /> : null}
          {toolCalls.length > 0 ? <ToolTraces tools={toolCalls} /> : null}
        </>
      )}

      {hasBody ? (
        // Staged reply: the worker streams partial body text into the message
        // row; the typewriter reveal + bottom-fade mask + writing caret make
        // chunked updates read as continuous streaming.
        <div aria-label={`${assistantName} is writing`} className="arc-streaming">
          <ArcBody body={typed} />
          <span aria-hidden className="arc-caret" />
        </div>
      ) : !hasSteps ? (
        <div className="flex items-center gap-2.5" role="status" aria-live="polite" aria-label={`${assistantName} is thinking`}>
          <span className="arc-tstep-dot"><span className="core" /></span>
          <span className="text-sm leading-5">
            <span style={{ fontFamily: "var(--font-serif)" }} className="italic text-[var(--text-secondary)]">Thinking</span>
            <span className="arc-shimmer font-medium">…</span>
          </span>
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
        {stalled ? (
          <>
            <span className="text-[var(--text-muted)]">· taking longer than usual</span>
            <button
              type="button"
              onClick={() => {
                onStop();
                onRetry();
              }}
              className="rounded-md border border-[var(--border-hairline)] px-2 py-0.5 font-semibold text-[var(--accent-contrast)] transition hover:border-[var(--accent)]"
            >
              Retry
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}

function StepTrace({ steps }: { steps: ArcStep[] }) {
  if (steps.length === 0) return null;
  // Prefer a calm count-led headline ("Creating lead · 26") when one repeated
  // action dominated; otherwise fall back to a plain step count.
  const { groups, totalSteps } = summarizeSteps(steps);
  const counted = groups.filter((g) => g.count > 1);
  const title =
    counted.length === 1
      ? `${counted[0].title} · ${counted[0].count}`
      : `Chain of thought · ${totalSteps} step${totalSteps === 1 ? "" : "s"}`;
  return (
    <div className="mt-3">
      <ChainOfThoughtTrace steps={steps.map((s) => ({ ...s, status: "done" as const }))} title={title} />
    </div>
  );
}

function MentionChips({ mentions, align }: { mentions: ArcMessage["mentions"]; align?: "end" }) {
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

function References({ assistantName, mentions }: { assistantName: string; mentions: ArcMessage["mentions"] }) {
  if (mentions.length === 0) return null;
  // AI Elements Sources (rethemed): a collapsible citation list — reinforces
  // that Mark's replies are source-backed records. Open by default so the
  // evidence stays obvious, collapsible to reclaim space on long threads.
  return (
    <Sources defaultOpen className="mt-3">
      <SourcesTrigger count={mentions.length} aria-label={`Sources ${assistantName} used`}>
        <span>Sources {assistantName} used</span>
        <span className="text-[var(--text-muted)]">· {mentions.length}</span>
        <svg viewBox="0 0 20 20" aria-hidden className="h-3 w-3 text-[var(--text-muted)] transition-transform group-data-[state=open]:rotate-180" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="m6 8 4 4 4-4" />
        </svg>
      </SourcesTrigger>
      <SourcesContent>
        {mentions.map((m) => (
          <Link
            key={`${m.type}:${m.id}`}
            href={m.href}
            className="inline-flex items-center rounded-md bg-[var(--surface-inset)] px-2 py-0.5 text-xs font-medium text-[var(--text-secondary)] shadow-[inset_0_0_0_1px_var(--border-strong)] transition hover:text-[var(--accent)]"
          >
            @{m.label}
          </Link>
        ))}
      </SourcesContent>
    </Sources>
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

/** Arc replies render as markdown, mapped onto Signal tokens. */
const mdComponents: Components = {
  p: ({ children }) => <p className="text-[15px] leading-[1.72] text-[var(--text-primary)]">{children}</p>,
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  em: ({ children }) => <em>{children}</em>,
  ul: ({ children }) => <ul className="flex list-disc flex-col gap-1.5 pl-5 text-[15px] leading-[1.6] marker:text-[var(--text-muted)]">{children}</ul>,
  ol: ({ children }) => <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-[15px] leading-[1.6] marker:text-[var(--text-muted)]">{children}</ol>,
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

// Memoized on `body`: the markdown only re-parses when the text actually
// changes, so the 1s elapsed-timer tick (and other parent re-renders) during a
// streaming reply don't re-parse the whole document needlessly.
const ArcBody = memo(function ArcBody({ body }: { body: string }) {
  // Repair run-on seams ("…parallel.Excellent!") the runner sometimes streams,
  // so chunked text renders as clean paragraphs.
  const clean = normalizeArcBody(body);
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <ReactArcdown remarkPlugins={[remarkGfm]} components={mdComponents}>
        {clean}
      </ReactArcdown>
    </div>
  );
});

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
          className="msg-rise inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] shadow-[inset_0_0_0_1px_var(--border-hairline)] transition hover:text-[var(--text-primary)] hover:shadow-[inset_0_0_0_1px_var(--accent-border-strong)]"
          style={{ animationDelay: `${i * 55}ms` }}
        >
          <svg viewBox="0 0 20 20" aria-hidden className="h-3.5 w-3.5 shrink-0 text-[var(--accent)]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 10h11M11 6l4 4-4 4" />
          </svg>
          {s}
        </button>
      ))}
    </div>
  );
}

function markAvatarStateForMessageStatus(status: ArcMessage["status"]) {
  if (status === "pending") return "thinking";
  if (status === "failed") return "asleep";
  if (status === "complete") return "speaking";
  return "idle";
}

function Message({
  message,
  assistantName,
  onRetry,
  onStop,
  onRegenerate,
  onEditResend,
  onSuggestion,
  onOpenAsset,
  onDecision,
}: {
  message: ArcMessage;
  assistantName: string;
  onRetry: () => void;
  onStop: () => void;
  onRegenerate: (markMessageId: string) => void;
  onEditResend?: (messageId: string, newBody: string) => void;
  onSuggestion: (prompt: string) => void;
  onOpenAsset?: (assetId?: string) => void;
  onDecision?: (assetId: string, decision: "approved" | "declined" | "revision") => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(message.body);
  const editRef = useRef<HTMLTextAreaElement>(null);
  // Focus + size the editor and drop the caret at the end when it opens.
  useEffect(() => {
    if (!editing) return;
    const el = editRef.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 320)}px`;
  }, [editing]);

  function openEditor() {
    setEditText(message.body);
    setEditing(true);
  }
  function saveEdit() {
    const next = editText.trim();
    if (!next || next === message.body.trim()) {
      setEditing(false);
      return;
    }
    onEditResend?.(message.id, next);
    setEditing(false);
  }

  // Operator: right-aligned bubble (ChatGPT-style), edit + timestamp on hover.
  if (message.role === "operator") {
    const canEdit = Boolean(onEditResend);
    if (editing) {
      return (
        <div className="flex flex-col items-end">
          <div className="w-full max-w-[48rem] rounded-2xl rounded-br-md bg-[var(--surface-panel)] p-2 shadow-[inset_0_0_0_1px_var(--accent-border-strong)]">
            <textarea
              ref={editRef}
              value={editText}
              onChange={(e) => {
                setEditText(e.target.value);
                e.target.style.height = "auto";
                e.target.style.height = `${Math.min(e.target.scrollHeight, 320)}px`;
              }}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.preventDefault();
                  setEditing(false);
                } else if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  saveEdit();
                }
              }}
              rows={1}
              aria-label="Edit your message"
              className="max-h-[320px] w-full resize-none bg-transparent px-2 py-1 text-sm leading-6 text-[var(--text-primary)] outline-none"
            />
            <div className="mt-1 flex items-center justify-end gap-1.5">
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="rounded-md px-2.5 py-1 text-xs font-semibold text-[var(--text-muted)] transition hover:bg-[var(--surface-inset)] hover:text-[var(--text-primary)]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveEdit}
                disabled={!editText.trim() || editText.trim() === message.body.trim()}
                className="rounded-md bg-[var(--accent)] px-2.5 py-1 text-xs font-semibold text-[var(--on-accent)] transition hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                Save &amp; resend
              </button>
            </div>
          </div>
          <span className="mt-1 pr-1 text-[10px] text-[var(--text-muted)]">Enter to resend · Esc to cancel</span>
        </div>
      );
    }
    return (
      <div className="group flex flex-col items-end">
        <div className="max-w-[44rem] whitespace-pre-wrap [overflow-wrap:anywhere] rounded-2xl rounded-br-md bg-[var(--surface-panel)] px-4 py-2.5 text-[15px] leading-[1.6] text-[var(--text-primary)] shadow-[inset_0_0_0_1px_var(--border-strong)]">
          {message.body}
        </div>
        {message.attachments.length > 0 ? (
          <div className="mt-1.5 flex max-w-[48rem] flex-wrap justify-end gap-1.5">
            {message.attachments.map((a) =>
              attachmentKind(a.contentType) === "image" ? (
                <a key={a.objectPath} href={a.url} target="_blank" rel="noreferrer" className="overflow-hidden rounded-lg shadow-[inset_0_0_0_1px_var(--border-strong)]">
                  {/* eslint-disable-next-line @next/next/no-img-element -- signed GCS URL, no optimizer config */}
                  <img src={a.url} alt={a.name} className="h-24 w-24 object-cover transition hover:opacity-90" />
                </a>
              ) : (
                <a key={a.objectPath} href={a.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs text-[var(--text-secondary)] shadow-[inset_0_0_0_1px_var(--border-strong)] transition hover:text-[var(--text-primary)]">
                  <span className="font-semibold uppercase">{attachmentKind(a.contentType) === "pdf" ? "PDF" : "TXT"}</span>
                  <span className="max-w-[12rem] truncate">{a.name}</span>
                </a>
              ),
            )}
          </div>
        ) : null}
        <MentionChips mentions={message.mentions} align="end" />
        <div className="mt-1 flex items-center gap-1 pr-1 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
          {canEdit ? (
            <button
              type="button"
              onClick={openEditor}
              className="rounded-md px-2 py-0.5 text-[11px] font-semibold text-[var(--text-muted)] transition hover:bg-[var(--surface-inset)] hover:text-[var(--text-primary)]"
            >
              Edit
            </button>
          ) : null}
          <span className="text-[10px] tabular-nums text-[var(--text-muted)]" suppressHydrationWarning>
            {formatTime(message.createdAt)}
          </span>
        </div>
      </div>
    );
  }

  // Arc / system: full-width, avatar + name line + markdown body. Consecutive
  // Arc messages within a few minutes render compact (no repeated avatar/name).
  const pending = message.status === "pending";
  const failed = message.status === "failed";
  const avatarState = markAvatarStateForMessageStatus(message.status);
  // A concept image attached to a draft is folded INTO the draft card (and into
  // the work canvas) rather than shown as a loose attachment below it — one
  // deliverable, not three scattered blocks. Any extra media still gets a gallery.
  const draftCards = message.actions.filter((a) => a.kind === "draft");
  const isPackage = draftCards.length >= 2;
  const nonDraftCards = message.actions.filter((a) => a.kind !== "draft");
  const draftAction = draftCards[0];
  const cardImage = draftAction ? message.media.find((m) => m.kind === "image") : undefined;
  const galleryMedia = cardImage ? message.media.filter((m) => m !== cardImage) : message.media;
  return (
    <div className="group flex gap-3">
      {/* ChatGPT/Claude register: completed replies are plain text with no
          avatar or author label. The Arc orb appears only in the in-flight
          thinking state (and the empty/hero state) — the "subtle Arc tint". */}
      {pending ? <ArcAvatar size={34} state={avatarState} /> : null}
      <div className="min-w-0 flex-1 pt-0.5">
        {pending ? (
          <PendingBlock
            assistantName={assistantName}
            steps={message.steps}
            body={message.body}
            reasoning={message.reasoning ?? null}
            toolCalls={message.toolCalls ?? []}
            onStop={onStop}
            onRetry={onRetry}
          />
        ) : failed ? (
          <div className="whitespace-pre-wrap text-sm leading-7 text-[var(--priority-bright)]">{message.body}</div>
        ) : (
          <ArcBody body={message.body} />
        )}
        {!pending && message.reasoning ? <ArcReasoning text={message.reasoning} /> : null}
        {!pending && message.toolCalls && message.toolCalls.length > 0 ? <ToolTraces tools={message.toolCalls} /> : null}
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
          <div className="mt-1 flex items-center gap-0.5 text-[var(--text-muted)] opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
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
                  aria-label="Regenerate reply"
                  title="Regenerate"
                  onClick={() => onRegenerate(message.id)}
                  className={ICON_ACTION}
                >
                  <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M15.5 9a5.5 5.5 0 1 0-1.2 4.3" /><path d="M15.5 4v5h-5" /></svg>
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
  onEditResend,
  onSuggestion,
  onOpenAsset,
  onDecision,
}: {
  messages: ArcMessage[];
  assistantName?: string;
  onRetry: () => void;
  onStop: () => void;
  onRegenerate: (markMessageId: string) => void;
  onEditResend?: (messageId: string, newBody: string) => void;
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
  // Track count + thread so we can pick the right scroll behaviour: a *new*
  // message glides in (smooth), but a streaming update (the last reply growing
  // text every poll) follows instantly — overlapping smooth scrolls is what made
  // streaming feel jittery. Opening a thread / first paint jumps straight to the
  // bottom instead of animating through the whole history.
  const prevLenRef = useRef(messages.length);
  const prevThreadRef = useRef(messages[0]?.conversationId);
  const mountedRef = useRef(false);
  useEffect(() => {
    const grew = messages.length > prevLenRef.current;
    const thread = messages[0]?.conversationId;
    const threadChanged = thread !== prevThreadRef.current;
    const first = !mountedRef.current;
    prevLenRef.current = messages.length;
    prevThreadRef.current = thread;
    mountedRef.current = true;
    if (!pinnedRef.current) return; // reader scrolled up — never yank them down
    const el = scrollRef.current;
    const jump = () => {
      if (el) el.scrollTop = el.scrollHeight;
      else endRef.current?.scrollIntoView({ block: "end" });
    };
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (first || threadChanged || reduce) {
      jump(); // no long animated scroll on open
    } else if (grew) {
      endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); // new turn glides in
    } else {
      jump(); // streaming text — stick to the bottom without animation fighting
    }
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
      {/* Soft top fade so messages dissolve under the header as they scroll up,
          instead of clipping at a hard edge (premium depth cue). Pinned over the
          viewport, never intercepts clicks. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 z-10 h-6 bg-gradient-to-b from-[var(--canvas)] to-transparent"
      />
      <div ref={scrollRef} onScroll={onScroll} className="h-full overflow-y-auto">
        <div className="mx-auto flex w-full max-w-[48rem] flex-col px-4 py-6 sm:px-6">
          {rows.map(({ m, day, showSeparator, compact }, i) => (
            <div key={m.id} className={cx("msg-rise", i === 0 ? "" : compact ? "mt-2.5" : "mt-6")}>
              {showSeparator ? (
                <div className={i === 0 ? "mb-6" : "mb-6 mt-1"}>
                  <DaySeparator label={day} />
                </div>
              ) : null}
              <Message
                message={m}
                assistantName={assistantName}
                onRetry={onRetry}
                onStop={onStop}
                onRegenerate={onRegenerate}
                onEditResend={onEditResend}
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
