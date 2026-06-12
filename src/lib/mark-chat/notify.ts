import { createHmac } from "node:crypto";

import { type MarkMention } from "@/domain";

import { resolveAgentConnection } from "@/lib/agent/connection";
import { resolveWebhookSecret } from "@/lib/agent/secret";
import { type MarkAttachment } from "./persistence";

export type MarkNotifyPayload = {
  /** The operator message row that triggered this wake (mark_messages.id). */
  messageId: string;
  conversationId: string;
  /** The queued agent_task Mark settles when it posts its reply back. */
  agentTaskId: string;
  message: string;
  mentions: MarkMention[];
  operator: string;
  /**
   * Model-routing hint for the external runner. Routine chat rides the cheap/fast
   * path ("fast"); reserve "standard" for heavier work. The app holds no model
   * keys — this is only advisory metadata for Mark's own router.
   */
  route: "fast" | "standard";
  /** Operator stance (ask/act/draft); advisory for Mark's worker. */
  mode: "ask" | "act" | "draft";
  /** Structured slash command id (e.g. "find-leads"), or null for plain chat. */
  command?: string | null;
  /** Operator-uploaded reference images (GCS signed read URLs) for Mark to use. */
  attachments?: MarkAttachment[];
};

/**
 * Wake Mark the moment a chat message is sent — push, not poll (Telegram-style).
 * POSTs the message to MARK_RUNNER_URL (Mark's Hermes Agent webhook route; the
 * legacy MARK_WEBHOOK_URL is still honored as a fallback). Hermes turns the
 * payload into a prompt, runs Mark, and Mark posts his
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
 * Returns whether the wake was delivered (a 2xx from the webhook). The caller
 * uses this to decide whether to claim the task now (push path) or leave it
 * queued for the inbox fallback.
 *
 * Env:
 *   MARK_RUNNER_URL      — Mark/Hermes runner webhook route, e.g.
 *                          https://host:8644/webhooks/growth-chat. (Legacy alias:
 *                          MARK_WEBHOOK_URL — read as a fallback for back-compat.)
 *   MARK_WEBHOOK_SECRET  — the route's secret (used to HMAC-sign the body)
 */
export async function notifyMarkWebhook(payload: MarkNotifyPayload): Promise<boolean> {
  const connection = await resolveAgentConnection();
  const url = connection.webhookUrl;
  if (!url) return false;
  if (!connection.enabled) return false;

  const body = JSON.stringify({ type: "mark_chat_message", ...payload });
  const headers: Record<string, string> = { "content-type": "application/json" };

  const secret = await resolveWebhookSecret(connection.webhookSecretRef);
  if (secret) {
    headers["x-webhook-signature"] = createHmac("sha256", secret).update(body).digest("hex");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);

  try {
    const res = await fetch(url, { method: "POST", headers, body, signal: controller.signal });
    return res.ok;
  } catch {
    // Best-effort wake-up; intentionally swallow errors and let the inbox catch it.
    return false;
  } finally {
    clearTimeout(timeout);
  }
}
