import { resolveAgentConnection } from "@/lib/agent/connection";

export async function markAgentKeys(): Promise<string[]> {
  const connection = await resolveAgentConnection();
  return [connection.agentKey];
}

export async function isMarkRunnerConfigured(): Promise<boolean> {
  const connection = await resolveAgentConnection();
  return Boolean(connection.webhookUrl && connection.enabled);
}

export async function getMarkDisplayName(): Promise<string> {
  const connection = await resolveAgentConnection();
  return connection.displayName;
}

export type AgentProfile = { name: string; shortName: string; monogram: string };

/** Derive display identity from a resolved name. Pure; empty falls back to "Arc". */
export function agentProfile(rawName: string | null | undefined): AgentProfile {
  const name = (rawName ?? "").trim() || "Arc";
  const shortName = name.split(/\s+/)[0];
  const firstAlnum = name.replace(/[^A-Za-z0-9]/g, "")[0] ?? name[0];
  return { name, shortName, monogram: firstAlnum.toUpperCase() };
}

/** Resolve the agent's display name: operator override (DB) → env → "Arc". */
export function getAgentDisplayName(override: string | null | undefined): string {
  return override?.trim() || process.env.MARK_DISPLAY_NAME?.trim() || "Arc";
}

/** Whether any agent link is configured (runner endpoint or inbound API token). */
export function isAgentConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(env.MARK_RUNNER_URL ?? env.MARK_WEBHOOK_URL) || Boolean(env.HERMES_AGENT_API_TOKEN?.trim());
}

/**
 * Freshness window for the "attached" trust signal. Every authenticated
 * /api/v1/hermes call stamps agent_connections.last_seen_at (the poller's poll, a
 * realtime reply, a webhook test), so a recent ok heartbeat is the ground truth
 * that an agent is live. Tuned above the poller's heartbeat cadence (~10–60s) so a
 * single missed beat doesn't flip the indicator to amber.
 */
export const AGENT_LIVENESS_WINDOW_MS = 3 * 60_000;

/**
 * Pure: is an agent currently attached, judged by a recent ok heartbeat?
 * Architecture-agnostic — true for the realtime subscriber, the poller, or a
 * webhook alike, as long as the agent is actually talking to the app. Does NOT
 * depend on a configured webhook URL or agent-key naming.
 */
export function isAgentLive(
  lastStatus: string | null | undefined,
  lastSeenAtIso: string | null | undefined,
  nowMs: number,
  windowMs: number = AGENT_LIVENESS_WINDOW_MS,
): boolean {
  if (lastStatus !== "ok" || !lastSeenAtIso) return false;
  const seenMs = Date.parse(lastSeenAtIso);
  if (Number.isNaN(seenMs)) return false;
  return nowMs - seenMs <= windowMs;
}
