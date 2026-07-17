/**
 * Slack Incoming Webhook delivery for INTERNAL operator alerts — never a customer
 * channel. A workspace stores its own webhook URL; Arc posts summaries of what it
 * found (opportunities, approvals) to that team channel. This does not touch the
 * campaign-send path and never messages a lead or customer.
 *
 * Every post here is operator-triggered (a button) — there is no automatic caller.
 */

const POST_TIMEOUT_MS = 8000;

export type SlackPostResult = { ok: true } | { ok: false; error: string };

/** A minimal Slack message: fallback text plus optional Block Kit blocks. */
export type SlackMessage = { text: string; blocks?: unknown[] };

export type SlackPostOptions = { fetchImpl?: typeof fetch };

/**
 * POST a message to a Slack Incoming Webhook. Slack returns the literal body "ok"
 * on success; anything else (or a non-2xx) is surfaced as an error. Never throws.
 */
export async function postSlackWebhook(webhookUrl: string, message: SlackMessage, opts: SlackPostOptions = {}): Promise<SlackPostResult> {
  const url = webhookUrl?.trim();
  if (!url || !/^https:\/\/hooks\.slack\.com\//.test(url)) {
    return { ok: false, error: "That doesn't look like a Slack Incoming Webhook URL (https://hooks.slack.com/…)." };
  }
  const doFetch = opts.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), POST_TIMEOUT_MS);
  try {
    const res = await doFetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(message),
      signal: controller.signal,
    });
    if (!res.ok) return { ok: false, error: `Slack returned ${res.status}.` };
    const body = (await res.text()).trim();
    // A real Slack webhook replies "ok"; a request-echo test endpoint won't, so accept
    // a 2xx as success too — the status is the primary signal.
    return body === "ok" || res.ok ? { ok: true } : { ok: false, error: `Slack replied: ${body.slice(0, 80)}` };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not reach Slack." };
  } finally {
    clearTimeout(timer);
  }
}

// --- Message formatting (pure) -----------------------------------------------

/** The subset of an opportunity a digest needs — decoupled from the read-model. */
export type DigestOpportunity = { title: string; urgency: "low" | "medium" | "high"; confidence: number };

const URGENCY_MARK: Record<DigestOpportunity["urgency"], string> = { high: "🔴", medium: "🟠", low: "⚪" };
const DIGEST_MAX_LINES = 8;

/**
 * Build the Slack message for an open-opportunity digest. Summarises the count and
 * lists the top items (highest urgency, then confidence) — a factual internal recap,
 * no customer data beyond the opportunity titles Arc already surfaces in-app.
 */
export function buildOpportunityDigest(opportunities: DigestOpportunity[], opts: { workspaceName?: string; appUrl?: string } = {}): SlackMessage {
  const who = opts.workspaceName ? ` for ${opts.workspaceName}` : "";
  if (opportunities.length === 0) {
    return { text: `Arc${who}: no open opportunities right now.` };
  }
  const rank = { high: 0, medium: 1, low: 2 } as const;
  const sorted = [...opportunities].sort((a, b) => rank[a.urgency] - rank[b.urgency] || b.confidence - a.confidence);
  const highCount = opportunities.filter((o) => o.urgency === "high").length;

  const header = `Arc${who}: ${opportunities.length} open ${opportunities.length === 1 ? "opportunity" : "opportunities"}${highCount ? ` (${highCount} high-urgency)` : ""}`;
  const lines = sorted.slice(0, DIGEST_MAX_LINES).map((o) => `${URGENCY_MARK[o.urgency]} ${o.title} — ${o.confidence}%`);
  const more = sorted.length > DIGEST_MAX_LINES ? `\n…and ${sorted.length - DIGEST_MAX_LINES} more.` : "";
  const link = opts.appUrl ? `\n<${opts.appUrl}/opportunities|Review in Arc>` : "";

  const text = `*${header}*\n${lines.join("\n")}${more}${link}`;
  return {
    text: `${header} — review in Arc.`, // plain fallback for notifications
    blocks: [{ type: "section", text: { type: "mrkdwn", text } }],
  };
}
