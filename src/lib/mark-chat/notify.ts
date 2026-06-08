import { type MarkMention } from "@/domain";

export type MarkNotifyPayload = {
  agentTaskId: string;
  conversationId: string;
  message: string;
  mentions: MarkMention[];
  operator: string;
};

/**
 * Wake Mark the moment a chat message is sent — push, not poll (Telegram-style).
 * POSTs the message to MARK_WEBHOOK_URL so the agent runs only when there's
 * something to answer. Best-effort: never throws and uses a short timeout, so a
 * slow or absent agent can't block or fail the operator's send (the message is
 * already queued and can still be pulled from the inbox as a fallback).
 *
 * Env:
 *   MARK_WEBHOOK_URL     — the agent endpoint to POST to (if unset, no-op)
 *   MARK_WEBHOOK_SECRET  — optional shared secret sent as a Bearer token
 */
export async function notifyMarkWebhook(payload: MarkNotifyPayload): Promise<void> {
  const url = process.env.MARK_WEBHOOK_URL;
  if (!url) return;

  const secret = process.env.MARK_WEBHOOK_SECRET;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);

  try {
    await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(secret ? { authorization: `Bearer ${secret}` } : {}),
      },
      body: JSON.stringify({ type: "mark_chat_message", ...payload }),
      signal: controller.signal,
    });
  } catch {
    // Best-effort wake-up; intentionally swallow errors.
  } finally {
    clearTimeout(timeout);
  }
}
