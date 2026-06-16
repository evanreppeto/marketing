"use client";

import { cx } from "@/app/_components/theme";
import type { ArcMessage } from "@/lib/arc-chat/persistence";

/**
 * A lightweight per-thread context gauge: roughly how much of Arc's working
 * window this conversation is filling. The token figure is a client-side
 * estimate (~4 chars/token over message bodies, reasoning, steps, and tool I/O)
 * — a "is this thread getting long?" signal, not an exact count. The real
 * figure can replace it once the runner reports input_token_count
 * (agent_run_logs) back onto the thread.
 */

// Soft working-window budget the gauge fills against. Advisory only.
const SOFT_WINDOW_TOKENS = 120_000;

function estimateTokens(messages: ArcMessage[]): number {
  let chars = 0;
  for (const m of messages) {
    chars += m.body.length;
    if (m.reasoning) chars += m.reasoning.length;
    for (const s of m.steps) {
      chars += s.label.length;
      if (s.detail) for (const d of s.detail) chars += d.length;
    }
    if (m.toolCalls) for (const t of m.toolCalls) chars += (t.input?.length ?? 0) + (t.output?.length ?? 0);
  }
  return Math.round(chars / 4);
}

function formatTokens(tokens: number): string {
  if (tokens < 1000) return `${tokens}`;
  const k = tokens / 1000;
  return `${k < 10 ? k.toFixed(1) : Math.round(k)}k`;
}

export function ContextMeter({ messages }: { messages: ArcMessage[] }) {
  if (messages.length === 0) return null;
  const tokens = estimateTokens(messages);
  const fill = Math.min(1, tokens / SOFT_WINDOW_TOKENS);
  const pct = Math.round(fill * 100);
  const tone = fill > 0.9 ? "priority" : fill > 0.7 ? "warn" : "accent";
  const barColor = tone === "priority" ? "var(--priority-bright)" : tone === "warn" ? "var(--warn)" : "var(--accent)";

  return (
    <span
      className="hidden items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium text-[var(--text-secondary)] shadow-[inset_0_0_0_1px_var(--border-hairline)] sm:inline-flex"
      title={`Context window — about ${pct}% of Arc's working window in use (≈${formatTokens(tokens)} tokens across ${messages.length} message${messages.length === 1 ? "" : "s"}). Estimated client-side; the exact figure comes from the runner.`}
      aria-label={`Context window about ${pct} percent full, roughly ${formatTokens(tokens)} tokens`}
    >
      <span aria-hidden className="relative h-1.5 w-7 overflow-hidden rounded-full bg-[var(--border-strong)]">
        <span className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-300" style={{ width: `${Math.max(4, pct)}%`, backgroundColor: barColor }} />
      </span>
      <span className={cx("tabular-nums", fill > 0.9 ? "text-[var(--priority-bright)]" : fill > 0.7 ? "text-[var(--warn)]" : "")}>
        ~{formatTokens(tokens)}
      </span>
    </span>
  );
}
