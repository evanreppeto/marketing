import type { ArcClient } from "./arc-client";
import type { ArcHistoryTurn } from "./types";

/** A prompt-ready memory line recalled from the brain (mirrors the app's RecallItem). */
export type RecallItem = {
  label: string;
  summary: string | null;
  kind: string;
  related?: string[];
  confidence?: number;
  nodeId?: string;
  /** When the fact was recorded (ISO). Absent when the source couldn't date it. */
  recordedAt?: string;
};

/**
 * Fetch the org's durable memory for this turn; fall back to [] on any error so a
 * recall hiccup never breaks a turn (mirrors resolveBusinessContext).
 */
export async function resolveRecallMemory(client: ArcClient, message: string): Promise<RecallItem[]> {
  try {
    const res = await client.apiPost<{ memory?: RecallItem[] }>("/api/v1/arc/brain/recall", { message });
    return Array.isArray(res.memory) ? res.memory : [];
  } catch {
    return [];
  }
}

/** How many recent turns to fold into the recall query so multi-turn chats
 *  recall against the live thread, not just the latest message. */
const RECALL_HISTORY_TURNS = 4;

/**
 * Compose the recall query from the recent conversation window + the current
 * message, so brain recall isn't myopic on multi-turn chats. With no history it
 * returns the message unchanged (preserving the original single-shot behavior).
 */
export function buildRecallQuery(history: ArcHistoryTurn[] | undefined, message: string): string {
  const recent = (history ?? []).slice(-RECALL_HISTORY_TURNS).map((t) => t.body ?? "");
  return [...recent, message].filter((s) => s.trim().length > 0).join("\n");
}
