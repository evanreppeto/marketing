import { postWebhook } from "@/lib/integrations/webhook/post";

import { registerChannel, type ChannelConnector, type ChannelDispatchInput, type ChannelDispatchResult } from "../registry";

// ---------------------------------------------------------------------------
// Real `channel` connector for outbound webhooks. dispatch() performs an actual
// approval-gated POST of the approved payload to the workspace's configured
// endpoint. It is invoked ONLY behind the human gate — it refuses without an
// approvalId (defence-in-depth on top of any caller's own check), so nothing
// reaches the outside world unapproved. There is no automatic caller.
// ---------------------------------------------------------------------------

export function readEndpoint(config: Record<string, unknown>): string | null {
  const url = config.endpoint ?? config.url;
  return typeof url === "string" && url.trim().length > 0 ? url.trim() : null;
}

export async function dispatchWebhook(input: ChannelDispatchInput): Promise<ChannelDispatchResult> {
  // Defence in depth: the channel itself refuses an unapproved send.
  if (!input.approvalId || !input.approvalId.trim()) {
    return { ok: false, error: "Refusing to dispatch: no approval on record." };
  }
  const endpoint = readEndpoint(input.config);
  if (!endpoint) {
    return { ok: false, error: "No endpoint configured for the webhook channel." };
  }
  const result = await postWebhook(endpoint, {
    type: "arc.approved_send",
    approvalId: input.approvalId,
    medium: input.payload.medium ?? "webhook",
    subject: input.payload.subject,
    body: input.payload.body,
    to: input.payload.to,
    meta: input.payload.meta,
  });
  return result.ok
    ? { ok: true, providerRef: `webhook:${endpoint}` }
    : { ok: false, error: result.error };
}

export const webhookChannelConnector: ChannelConnector = {
  key: "webhook-dispatch",
  dispatch: dispatchWebhook,
};

registerChannel(webhookChannelConnector);
