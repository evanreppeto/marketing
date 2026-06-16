import { type SupabaseClient } from "@supabase/supabase-js";

import { getConversation, listMessages, type MarkMessage } from "./persistence";
import { getSupabaseAdminClient } from "../supabase/server";

/** One prior turn handed to the runner so Arc has memory. */
export type WakeHistoryTurn = { role: "operator" | "arc"; body: string };

const DEFAULT_HISTORY_LIMIT = 12;

/**
 * Pure: distil persisted messages into bounded turns for the wake. Keeps only
 * settled, non-empty operator and Arc ("mark") messages; drops pending/failed/
 * system and the current message; returns the most recent `limit`, oldest first.
 */
export function buildWakeHistory(
  messages: MarkMessage[],
  options: { limit?: number; excludeId?: string } = {},
): WakeHistoryTurn[] {
  const limit = options.limit ?? DEFAULT_HISTORY_LIMIT;
  const turns: WakeHistoryTurn[] = [];
  for (const m of messages) {
    if (m.id === options.excludeId) continue;
    if (m.role !== "operator" && m.role !== "mark") continue;
    const body = m.body.trim();
    if (!body) continue;
    if (m.role === "operator" && m.status !== "sent") continue;
    if (m.role === "mark" && m.status !== "complete") continue;
    turns.push({ role: m.role === "mark" ? "arc" : "operator", body });
  }
  return turns.slice(-limit);
}

/**
 * I/O: load the project/campaign scope + bounded history for a conversation,
 * ready to merge into the wake payload. Best-effort caller decides what to do on
 * throw; this surfaces errors so the caller can fall back to a bare wake.
 */
export async function loadWakeContext(
  conversationId: string,
  options: { excludeId?: string } = {},
  client: SupabaseClient = getSupabaseAdminClient(),
): Promise<{ projectId: string | null; campaignId: string | null; history: WakeHistoryTurn[] }> {
  const [conversation, messages] = await Promise.all([
    getConversation(conversationId, client),
    listMessages(conversationId, client),
  ]);
  return {
    projectId: conversation?.projectId ?? null,
    campaignId: conversation?.campaignId ?? null,
    history: buildWakeHistory(messages, { excludeId: options.excludeId }),
  };
}
