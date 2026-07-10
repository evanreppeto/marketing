import { registerChannel, type ChannelConnector, type ChannelDispatchInput, type ChannelDispatchResult } from "../registry";

// ---------------------------------------------------------------------------
// Stub `channel` connector proving the registry (BSR-363). A channel's dispatch()
// is invoked ONLY by the approved-send path (src/lib/connectors/dispatch.ts),
// which refuses to run without an approvalId. This stub does NOT actually POST —
// it returns a dry-run result so nothing reaches the outside world until a real
// implementation is wired behind the same human gate. There is no code path in
// this repo that calls dispatch() automatically.
// ---------------------------------------------------------------------------

function readEndpoint(config: Record<string, unknown>): string | null {
  const url = config.endpoint ?? config.url;
  return typeof url === "string" && url.trim().length > 0 ? url.trim() : null;
}

export async function dispatchWebhook(input: ChannelDispatchInput): Promise<ChannelDispatchResult> {
  // Defence in depth: even though dispatch.ts already gates on approvalId, the
  // channel itself refuses an unapproved send.
  if (!input.approvalId || !input.approvalId.trim()) {
    return { ok: false, error: "Refusing to dispatch: no approval on record." };
  }
  const endpoint = readEndpoint(input.config);
  if (!endpoint) {
    return { ok: false, error: "No endpoint configured for the webhook channel." };
  }
  // Stub: report what WOULD be sent without sending it. Swap this for a real,
  // still-approval-gated fetch() when the outbound webhook is productionised.
  return { ok: true, providerRef: `dry-run:${endpoint}` };
}

export const webhookChannelConnector: ChannelConnector = {
  key: "webhook-dispatch",
  dispatch: dispatchWebhook,
};

registerChannel(webhookChannelConnector);
