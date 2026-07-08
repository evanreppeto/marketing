import type { ArcClient } from "./arc-client";
import type { ArcHistoryTurn } from "./types";

/** Older un-summarized turns to fold into the rolling summary after replying. */
export type HistoryOverflow = { turns: ArcHistoryTurn[]; throughMessageId: string };

/** Compaction-aware conversation context, as served by
 *  GET /api/v1/arc/conversations/{id}/context. */
export type ConversationContext = {
  history: ArcHistoryTurn[];
  summary: string | null;
  overflow: HistoryOverflow | null;
};

const EMPTY: ConversationContext = { history: [], summary: null, overflow: null };

/**
 * Fetch this conversation's memory for the turn: the rolling summary of earlier
 * turns, the recent turns verbatim, and the overflow to compact next. This is what
 * gives Arc chat memory across turns. Best-effort — any failure returns empty
 * context so a fetch problem degrades to a memoryless (but working) reply.
 */
export async function fetchConversationContext(
  client: ArcClient,
  conversationId: string,
  excludeMessageId?: string | null,
): Promise<ConversationContext> {
  try {
    const res = await client.apiGet<Partial<ConversationContext>>(
      `/api/v1/arc/conversations/${conversationId}/context`,
      excludeMessageId ? { excludeMessageId } : undefined,
    );
    return {
      history: res.history ?? [],
      summary: res.summary ?? null,
      overflow: res.overflow ?? null,
    };
  } catch {
    return EMPTY;
  }
}

/** Persist an updated rolling summary. Best-effort — a failed persist just means
 *  the overflow gets re-summarized next turn (idempotent), never a broken reply. */
export async function persistConversationSummary(
  client: ArcClient,
  conversationId: string,
  input: { summary: string; summaryThroughMessageId: string },
): Promise<void> {
  try {
    await client.apiPost(`/api/v1/arc/conversations/${conversationId}/summary`, { ...input });
  } catch {
    // swallow — compaction is best-effort
  }
}
