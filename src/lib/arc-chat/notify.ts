import { createHmac } from "node:crypto";

import { type ArcMention } from "@/domain";
import { type ApprovalStrictness, type AssistantResponseStyle, type AssistantTone } from "@/lib/settings/store";

import { resolveAgentConnection } from "@/lib/agent/connection";
import { recordTestResult } from "@/lib/agent/health";
import { resolveWebhookSecret } from "@/lib/agent/secret";
import { type ArcAttachment } from "./persistence";

export type ArcNotifyPayload = {
  /** The operator message row that triggered this wake (arc_messages.id). */
  messageId: string;
  conversationId: string;
  /** The queued agent_task Arc settles when it posts its reply back. */
  agentTaskId: string;
  message: string;
  mentions: ArcMention[];
  operator: string;
  /**
   * Model-routing hint for the external runner. Routine chat rides the cheap/fast
   * path ("fast"); reserve "standard" for heavier work. The app holds no model
   * keys — this is only advisory metadata for Arc's own router.
   */
  route: "fast" | "standard";
  /** Operator stance (ask/act/draft); advisory for Arc's worker. */
  mode: "ask" | "act" | "draft";
  /** Operator-selected behavior hints from Settings -> Agent behavior. */
  assistantTone?: AssistantTone;
  assistantResponseStyle?: AssistantResponseStyle;
  approvalStrictness?: ApprovalStrictness;
  /** Structured slash command id (e.g. "find-leads"), or null for plain chat. */
  command?: string | null;
  /** Operator-uploaded reference images (GCS signed read URLs) for Arc to use. */
  attachments?: ArcAttachment[];
};

/**
 * Wake Arc the moment a chat message is sent — push, not poll (Telegram-style).
 * POSTs the message to ARC_RUNNER_URL (Arc's Arc Agent webhook route; the
 * legacy ARC_WEBHOOK_URL is still honored as a fallback). Arc turns the
 * payload into a prompt, runs Arc, and Arc posts his
 * reply back to POST /api/v1/arc/messages. The agent runs only when there's
 * something to answer — idle costs nothing.
 *
 * Auth matches Arc' generic webhook validator: an `X-Webhook-Signature`
 * header holding the raw HMAC-SHA256 hex digest of the request body, keyed by
 * the route secret (ARC_WEBHOOK_SECRET). If no secret is set, the header is
 * omitted (only valid against a Arc route using INSECURE_NO_AUTH on loopback).
 *
 * Best-effort: never throws and uses a short timeout, so a slow or unreachable
 * agent can't block or fail the operator's send (the message is already queued
 * and Arc can still pull it from the inbox as a fallback).
 *
 * Returns whether the wake was delivered (a 2xx from the webhook). The caller
 * uses this to decide whether to claim the task now (push path) or leave it
 * queued for the inbox fallback.
 *
 * Env:
 *   ARC_RUNNER_URL      — Arc/Arc runner webhook route, e.g.
 *                          https://host:8644/webhooks/growth-chat. (Legacy alias:
 *                          ARC_WEBHOOK_URL — read as a fallback for back-compat.)
 *   ARC_WEBHOOK_SECRET  — the route's secret (used to HMAC-sign the body)
 */
export async function notifyArcWebhook(payload: ArcNotifyPayload): Promise<boolean> {
  const connection = await resolveAgentConnection();
  const url = connection.webhookUrl;
  if (!url) return false;
  if (!connection.enabled) return false;

  const body = JSON.stringify({ type: "arc_chat_message", ...payload });
  const headers: Record<string, string> = { "content-type": "application/json" };

  const secret = await resolveWebhookSecret(connection.webhookSecretRef);
  if (secret) {
    headers["x-webhook-signature"] = createHmac("sha256", secret).update(body).digest("hex");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);

  try {
    const res = await fetch(url, { method: "POST", headers, body, signal: controller.signal });
    // The wake doubles as a reachability probe: record the outcome so the connection
    // pill reflects whether the runner actually answered, not just whether a URL is
    // configured. Best-effort — recordTestResult swallows its own errors.
    await recordTestResult({ status: res.ok ? "ok" : "error", error: res.ok ? null : `HTTP ${res.status}` });
    return res.ok;
  } catch {
    // Best-effort wake-up; intentionally swallow errors and let the inbox catch it.
    await recordTestResult({ status: "unreachable", error: "Wake request failed." });
    return false;
  } finally {
    clearTimeout(timeout);
  }
}
