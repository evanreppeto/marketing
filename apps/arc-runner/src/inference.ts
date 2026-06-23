import { query } from "@anthropic-ai/claude-agent-sdk";

/** The two work tiers the app routes to. Mirrors payload.route. */
export type ArcRoute = "fast" | "standard";

/**
 * Per-turn inference settings for the Agent SDK query() call.
 *
 * Interactive chat (fast) rides Sonnet with a light thinking budget so it
 * reasons a beat without feeling slow; heavier work (standard: drafting, scans,
 * campaign tasks) rides Opus with a deep thinking budget. `fallbackModel` keeps
 * a turn alive if the primary is unavailable; `maxTurns` + `maxBudgetUsd` are
 * runaway rails that keep the Opus path safe to run multi-tenant.
 *
 * These are the smartness/cost dials — tune them HERE, in one place.
 */
export type InferenceSettings = {
  model: string;
  fallbackModel: string;
  maxThinkingTokens: number;
  maxTurns: number;
  maxBudgetUsd: number;
};

const FAST: InferenceSettings = {
  model: "claude-sonnet-4-6",
  fallbackModel: "claude-haiku-4-5",
  maxThinkingTokens: 2_000,
  maxTurns: 12,
  maxBudgetUsd: 0.75,
};

const STANDARD: InferenceSettings = {
  model: "claude-opus-4-8",
  fallbackModel: "claude-sonnet-4-6",
  maxThinkingTokens: 10_000,
  maxTurns: 24,
  maxBudgetUsd: 3,
};

export function inferenceForRoute(route: ArcRoute): InferenceSettings {
  return route === "standard" ? STANDARD : FAST;
}

/**
 * The options object passed to the SDK's query(). Derived from the SDK's own
 * signature so it stays correct across SDK upgrades.
 */
type QueryOptions = NonNullable<Parameters<typeof query>[0]["options"]>;

/**
 * Build the query() options from per-turn inference settings, keeping the
 * outbound-safe permission posture. Pure + typed so it's unit-testable without
 * the SDK actually running.
 */
export function buildQueryOptions(args: {
  inference: InferenceSettings;
  systemPrompt: string;
  mcpServers: QueryOptions["mcpServers"];
  allowedTools: string[];
}): QueryOptions {
  return {
    systemPrompt: args.systemPrompt,
    model: args.inference.model,
    fallbackModel: args.inference.fallbackModel,
    maxThinkingTokens: args.inference.maxThinkingTokens,
    maxTurns: args.inference.maxTurns,
    maxBudgetUsd: args.inference.maxBudgetUsd,
    mcpServers: args.mcpServers,
    allowedTools: args.allowedTools,
    permissionMode: "bypassPermissions",
    // Emit token deltas so the reply can be typed out live; the final
    // assistant/result messages still land.
    includePartialMessages: true,
  };
}
