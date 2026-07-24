/**
 * Outbound webhook delivery. The `webhook-dispatch` channel connector posts an
 * approved payload to a workspace-configured endpoint (a Zapier catch-hook, a
 * customer automation, an internal service). Mirrors the Slack webhook client in
 * shape — https-only, timeout-bounded, never throws, injectable fetch for tests —
 * but carries a structured JSON body instead of Slack's Block Kit.
 *
 * Every post here is reached only from the human-approved send path (the channel's
 * dispatch() refuses without an approvalId) or an operator-triggered Test button.
 * There is no automatic caller.
 */

const POST_TIMEOUT_MS = 8000;

export type WebhookPostResult = { ok: true; status: number } | { ok: false; error: string };

/** The JSON envelope posted to the endpoint. `type` lets a receiver route by intent. */
export type WebhookPayload = {
  type: string;
  [key: string]: unknown;
};

export type WebhookPostOptions = { fetchImpl?: typeof fetch };

/**
 * POST a JSON payload to an outbound webhook endpoint. Any 2xx is success; a non-2xx
 * or a transport failure is surfaced as an error string (never thrown). Requires an
 * https URL so a stored endpoint can't silently downgrade to cleartext.
 */
export async function postWebhook(endpoint: string, payload: WebhookPayload, opts: WebhookPostOptions = {}): Promise<WebhookPostResult> {
  const url = endpoint?.trim();
  if (!url || !/^https:\/\//i.test(url)) {
    return { ok: false, error: "The webhook endpoint must be a full https:// URL." };
  }
  const doFetch = opts.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), POST_TIMEOUT_MS);
  try {
    const res = await doFetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": "Arc-Webhook/1.0" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!res.ok) return { ok: false, error: `Endpoint returned ${res.status}.` };
    return { ok: true, status: res.status };
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    return { ok: false, error: aborted ? "Endpoint timed out." : error instanceof Error ? error.message : "Could not reach the endpoint." };
  } finally {
    clearTimeout(timer);
  }
}
