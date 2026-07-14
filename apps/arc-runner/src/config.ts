/**
 * Runtime configuration for the Arc runner (bridge).
 *
 * Auth model: for a MULTI-TENANT product the runner authenticates the Claude
 * Agent SDK with an Anthropic API key (ANTHROPIC_API_KEY), billed to one account
 * and metered per workspace via the app's ai_usage_events ledger (postUsage). A
 * personal Claude *subscription* token (CLAUDE_CODE_OAUTH_TOKEN from
 * `claude setup-token`) is still supported for local dev / single-tenant pilots.
 * The SDK reads whichever is present from the environment; if both are set the
 * API key wins (SDK precedence), which is the desired production posture.
 */

export type Config = {
  appApiBaseUrl: string;
  arcAgentApiToken: string;
  webhookSecret: string | null;
  port: number;
  webhookPath: string;
};

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    console.error(`[arc-runner] Missing required env var: ${name}`);
    process.exit(1);
  }
  return value;
}

export function loadConfig(): Config {
  const appApiBaseUrl = required("APP_API_BASE_URL").replace(/\/+$/, "");
  const arcAgentApiToken = required("ARC_AGENT_API_TOKEN");

  // Claude credential: API key (multi-tenant) or subscription token (dev/pilot).
  const hasApiKey = !!process.env.ANTHROPIC_API_KEY?.trim();
  const hasOauth = !!process.env.CLAUDE_CODE_OAUTH_TOKEN?.trim();
  if (!hasApiKey && !hasOauth) {
    console.error(
      "[arc-runner] No Claude credential found. Set ANTHROPIC_API_KEY (multi-tenant), or run `claude setup-token` and set CLAUDE_CODE_OAUTH_TOKEN (local/pilot).",
    );
    process.exit(1);
  }
  if (hasApiKey && hasOauth) {
    console.log(
      "[arc-runner] ANTHROPIC_API_KEY is set; using the API key (multi-tenant billing). CLAUDE_CODE_OAUTH_TOKEN is ignored.",
    );
  }

  return {
    appApiBaseUrl,
    arcAgentApiToken,
    webhookSecret: process.env.ARC_WEBHOOK_SECRET?.trim() || null,
    port: Number(process.env.PORT) || 8788,
    webhookPath: process.env.WEBHOOK_PATH?.trim() || "/webhooks/growth-chat",
  };
}
