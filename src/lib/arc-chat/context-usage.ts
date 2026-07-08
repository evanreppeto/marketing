// Pure, dependency-free context-usage math for the chat "context meter". Mirrors
// the runner's working-history window: as a conversation fills this budget, Arc
// keeps the recent turns verbatim and compacts older ones into a rolling summary
// (see docs/CHAT-CONTEXT.md). The meter shows how close the chat is to that point,
// the way Claude's context bar does. No server imports — safe in the client bundle.

/**
 * The working-context window, in estimated tokens — kept in sync with the runner's
 * DEFAULT_HISTORY_TOKEN_BUDGET (src/lib/arc-chat/history.ts). Duplicated as a plain
 * constant so this stays a pure client module (history.ts pulls in server types).
 */
export const CONTEXT_WINDOW_TOKENS = 24_000;

/** Cheap ~4-chars/token estimate — the same heuristic the runner budgets with. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export type ContextLevel = "ok" | "warn" | "full";

export type ContextUsage = { tokens: number; pct: number; level: ContextLevel };

/**
 * Estimated context usage for a set of message bodies, as a fraction of the
 * working window. `pct` is clamped to 100; `level` drives the meter colour —
 * amber (`warn`) as it approaches the window, red (`full`) once compaction kicks in.
 */
export function contextUsage(bodies: string[], windowTokens: number = CONTEXT_WINDOW_TOKENS): ContextUsage {
  const tokens = bodies.reduce((sum, body) => sum + estimateTokens(body) + 3, 0);
  const pct = windowTokens > 0 ? Math.min(100, Math.round((tokens / windowTokens) * 100)) : 0;
  const level: ContextLevel = pct >= 100 ? "full" : pct >= 80 ? "warn" : "ok";
  return { tokens, pct, level };
}
