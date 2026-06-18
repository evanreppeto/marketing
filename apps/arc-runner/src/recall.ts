import type { ArcClient } from "./arc-client";

/** A prompt-ready memory line recalled from the brain (mirrors the app's RecallItem). */
export type RecallItem = { label: string; summary: string | null; kind: string; related?: string[] };

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
