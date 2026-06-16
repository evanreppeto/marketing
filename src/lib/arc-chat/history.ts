import { type SupabaseClient } from "@supabase/supabase-js";

import { getConversation, listMessages, type ArcMessage } from "./persistence";
import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "../supabase/server";

/** One prior turn handed to the runner so Arc has memory. */
export type WakeHistoryTurn = { role: "operator" | "arc"; body: string };

const DEFAULT_HISTORY_LIMIT = 12;

/**
 * Pure: distil persisted messages into bounded turns for the wake. Keeps only
 * settled, non-empty operator and Arc messages; drops pending/failed/system and
 * the current message; returns the most recent `limit`, oldest first.
 */
export function buildWakeHistory(
  messages: ArcMessage[],
  options: { limit?: number; excludeId?: string } = {},
): WakeHistoryTurn[] {
  const limit = options.limit ?? DEFAULT_HISTORY_LIMIT;
  const turns: WakeHistoryTurn[] = [];
  for (const m of messages) {
    if (m.id === options.excludeId) continue;
    if (m.role !== "operator" && m.role !== "arc") continue;
    const body = m.body.trim();
    if (!body) continue;
    if (m.role === "operator" && m.status !== "sent") continue;
    if (m.role === "arc" && m.status !== "complete") continue;
    turns.push({ role: m.role, body });
  }
  return turns.slice(-limit);
}

/**
 * I/O: load the project/campaign scope + bounded history for a conversation,
 * ready to merge into the wake payload. Degrades to a bare wake (empty scope +
 * no history) when Supabase isn't configured, so the caller can still send.
 */
export async function loadWakeContext(
  conversationId: string,
  options: { excludeId?: string } = {},
  client?: SupabaseClient,
): Promise<{ projectId: string | null; campaignId: string | null; history: WakeHistoryTurn[] }> {
  if (!isSupabaseAdminConfigured()) {
    return { projectId: null, campaignId: null, history: [] };
  }
  const db = client ?? getSupabaseAdminClient();
  const [conversation, messages] = await Promise.all([
    getConversation(conversationId, db),
    listMessages(conversationId, db),
  ]);
  return {
    projectId: conversation?.projectId ?? null,
    campaignId: conversation?.campaignId ?? null,
    history: buildWakeHistory(messages, { excludeId: options.excludeId }),
  };
}
