import { createHmac } from "node:crypto";

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
 * POSTs the message to MARK_WEBHOOK_URL, which is Mark's Hermes Agent webhook
 * route. Hermes turns the payload into a prompt, runs Mark, and Mark posts his
 * reply back to POST /api/v1/hermes/messages. The agent runs only when there's
 * something to answer — idle costs nothing.
 *
 * Auth matches Hermes' generic webhook validator: an `X-Webhook-Signature`
 * header holding the raw HMAC-SHA256 hex digest of the request body, keyed by
 * the route secret (MARK_WEBHOOK_SECRET). If no secret is set, the header is
 * omitted (only valid against a Hermes route using INSECURE_NO_AUTH on loopback).
 *
 * Best-effort: never throws and uses a short timeout, so a slow or unreachable
 * agent can't block or fail the operator's send (the message is already queued
 * and Mark can still pull it from the inbox as a fallback).
 *
 * Env:
 *   MARK_WEBHOOK_URL     — Hermes webhook route, e.g. https://host:8644/webhooks/growth-chat
 *   MARK_WEBHOOK_SECRET  — the route's secret (used to HMAC-sign the body)
 */
export async function notifyMarkWebhook(payload: MarkNotifyPayload): Promise<void> {
  const url = process.env.MARK_WEBHOOK_URL;
  if (!url) return;

  const body = JSON.stringify({ type: "mark_chat_message", ...payload });
  const headers: Record<string, string> = { "content-type": "application/json" };

  const secret = process.env.MARK_WEBHOOK_SECRET;
  if (secret) {
    headers["x-webhook-signature"] = createHmac("sha256", secret).update(body).digest("hex");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);

  try {
    await fetch(url, { method: "POST", headers, body, signal: controller.signal });
  } catch {
    // Best-effort wake-up; intentionally swallow errors.
  } finally {
    clearTimeout(timeout);
  }
}
