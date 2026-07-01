/**
 * Runtime configuration for the Arc runner (bridge).
 *
 * Auth model (prototype): Arc runs via the Claude Agent SDK authenticated with
 * your Claude *subscription* (CLAUDE_CODE_OAUTH_TOKEN from `claude setup-token`),
 * which bills your Max plan, not API credits. The SDK reads CLAUDE_CODE_OAUTH_TOKEN
 * from the environment. If ANTHROPIC_API_KEY is also set, it silently overrides
 * the OAuth token and bills API credits — so we warn loudly when we see it.
 * (Subscription auth is personal-use only; for a multi-tenant product, switch to
 * an API key.)
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

  // Auth sanity checks for the subscription path.
  if (!process.env.CLAUDE_CODE_OAUTH_TOKEN?.trim() && !process.env.ANTHROPIC_API_KEY?.trim()) {
    console.error(
      "[arc-runner] No Claude credential found. Run `claude setup-token` and set CLAUDE_CODE_OAUTH_TOKEN (or set ANTHROPIC_API_KEY for the API path).",
    );
    process.exit(1);
  }
  if (process.env.CLAUDE_CODE_OAUTH_TOKEN?.trim() && process.env.ANTHROPIC_API_KEY?.trim()) {
    console.warn(
      "[arc-runner] WARNING: ANTHROPIC_API_KEY is set alongside CLAUDE_CODE_OAUTH_TOKEN — the API key wins and will bill API credits, not your subscription. Unset ANTHROPIC_API_KEY to use your plan.",
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
