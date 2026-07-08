import { type SupabaseClient } from "@supabase/supabase-js";

import { getConversation, listMessages, type ArcMessage } from "./persistence";
import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "../supabase/server";

/** One prior turn handed to the runner so Arc has memory. */
export type WakeHistoryTurn = { role: "operator" | "arc"; body: string };

/**
 * Default raw-history budget, in estimated tokens. This is the "how much recent
 * conversation Arc sees verbatim" knob — a real-Claude-chat sliding window rather
 * than the old fixed 12-turn cut. Well under any model's context window, leaving
 * ample room for the system prompt, tools, recall, and the model's own output.
 * Turns older than this window are dropped today; auto-compaction (a rolling
 * summary of the overflow, see docs/MODEL-SELECTION.md follow-ups) will replace
 * that drop with a summary. A hard turn cap bounds payload size regardless.
 */
export const DEFAULT_HISTORY_TOKEN_BUDGET = 24_000;
const HARD_TURN_CAP = 400;

/** Cheap, dependency-free token estimate (~4 chars/token) plus a small per-turn
 *  overhead for the "Operator: …\n" framing the runner adds. Good enough for
 *  budgeting — exact counts aren't worth a tokenizer in this hot path. */
function estimateTurnTokens(turn: WakeHistoryTurn): number {
  return Math.ceil((turn.body.length + turn.role.length + 12) / 4);
}

/** Keep the most recent turns that fit the token budget, oldest-first. Always
 *  keeps at least the latest turn even if it alone exceeds the budget, and never
 *  exceeds HARD_TURN_CAP turns. */
export function selectHistoryWithinBudget(turns: WakeHistoryTurn[], tokenBudget: number): WakeHistoryTurn[] {
  const kept: WakeHistoryTurn[] = [];
  let used = 0;
  for (let i = turns.length - 1; i >= 0; i--) {
    const cost = estimateTurnTokens(turns[i]);
    if (kept.length > 0 && (used + cost > tokenBudget || kept.length >= HARD_TURN_CAP)) break;
    kept.push(turns[i]);
    used += cost;
  }
  return kept.reverse();
}

/** A settled turn that still knows its message id — needed to mark compaction. */
type IdentifiedTurn = WakeHistoryTurn & { id: string };

/** Keep only settled, non-empty operator/arc messages; drop pending/failed/system
 *  and the excluded (current) message. The shared filter behind history + planning. */
function settledTurns(messages: ArcMessage[], excludeId?: string): IdentifiedTurn[] {
  const turns: IdentifiedTurn[] = [];
  for (const m of messages) {
    if (m.id === excludeId) continue;
    if (m.role !== "operator" && m.role !== "arc") continue;
    const body = m.body.trim();
    if (!body) continue;
    if (m.role === "operator" && m.status !== "sent") continue;
    if (m.role === "arc" && m.status !== "complete") continue;
    turns.push({ id: m.id, role: m.role, body });
  }
  return turns;
}

/**
 * Pure: distil persisted messages into bounded turns for the wake. By default
 * returns the most recent turns that fit DEFAULT_HISTORY_TOKEN_BUDGET (oldest-first);
 * an explicit `limit` instead keeps the last N turns (back-compat / tests).
 */
export function buildWakeHistory(
  messages: ArcMessage[],
  options: { limit?: number; tokenBudget?: number; excludeId?: string } = {},
): WakeHistoryTurn[] {
  const turns = settledTurns(messages, options.excludeId).map(({ role, body }) => ({ role, body }));
  if (options.limit != null) return turns.slice(-options.limit);
  return selectHistoryWithinBudget(turns, options.tokenBudget ?? DEFAULT_HISTORY_TOKEN_BUDGET);
}

/** The overflow of older un-summarized turns to fold into the rolling summary. */
export type HistoryOverflow = { turns: WakeHistoryTurn[]; throughMessageId: string };

export type WakeHistoryPlan = {
  /** Recent turns sent verbatim (oldest-first), within the token budget. */
  verbatim: WakeHistoryTurn[];
  /** Older un-summarized turns that didn't fit — to compact next, or null. */
  overflow: HistoryOverflow | null;
};

/**
 * Pure compaction planner. Given all messages, the token budget, and the marker of
 * what's already summarized, split the un-summarized turns into the recent verbatim
 * window (what fits the budget) and the older overflow (what should be folded into
 * the rolling summary). Turns at or before `summaryThroughMessageId` are already in
 * the summary and are excluded entirely.
 */
export function planWakeHistory(
  messages: ArcMessage[],
  options: { tokenBudget?: number; summaryThroughMessageId?: string | null; excludeId?: string } = {},
): WakeHistoryPlan {
  const all = settledTurns(messages, options.excludeId);
  // Drop everything up to and including the already-summarized marker.
  let start = 0;
  if (options.summaryThroughMessageId) {
    const idx = all.findIndex((t) => t.id === options.summaryThroughMessageId);
    if (idx >= 0) start = idx + 1;
  }
  const unsummarized = all.slice(start);
  const budget = options.tokenBudget ?? DEFAULT_HISTORY_TOKEN_BUDGET;
  const verbatim = selectHistoryWithinBudget(
    unsummarized.map(({ role, body }) => ({ role, body })),
    budget,
  );
  const overflowCount = unsummarized.length - verbatim.length;
  const overflow: HistoryOverflow | null =
    overflowCount > 0
      ? {
          turns: unsummarized.slice(0, overflowCount).map(({ role, body }) => ({ role, body })),
          throughMessageId: unsummarized[overflowCount - 1].id,
        }
      : null;
  return { verbatim, overflow };
}

/**
 * I/O: load the project/campaign scope + compaction-aware history for a wake. The
 * runner gets the existing rolling `summary`, the recent turns verbatim, and the
 * `overflow` of older un-summarized turns to fold into the summary after replying.
 * Degrades to a bare wake when Supabase isn't configured, so the caller can still send.
 */
export async function loadWakeContext(
  conversationId: string,
  options: { excludeId?: string } = {},
  client?: SupabaseClient,
): Promise<{
  projectId: string | null;
  campaignId: string | null;
  history: WakeHistoryTurn[];
  summary: string | null;
  overflow: HistoryOverflow | null;
}> {
  if (!isSupabaseAdminConfigured()) {
    return { projectId: null, campaignId: null, history: [], summary: null, overflow: null };
  }
  const db = client ?? getSupabaseAdminClient();
  const [conversation, messages] = await Promise.all([
    getConversation(conversationId, db),
    listMessages(conversationId, db),
  ]);
  const plan = planWakeHistory(messages, {
    excludeId: options.excludeId,
    summaryThroughMessageId: conversation?.summaryThroughMessageId ?? null,
  });
  return {
    projectId: conversation?.projectId ?? null,
    campaignId: conversation?.campaignId ?? null,
    history: plan.verbatim,
    summary: conversation?.summary ?? null,
    overflow: plan.overflow,
  };
}
