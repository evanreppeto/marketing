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

/** Derive display identity from a resolved name. Pure; empty falls back to "Mark". */
export function agentProfile(rawName: string | null | undefined): AgentProfile {
  const name = (rawName ?? "").trim() || "Agent";
  const shortName = name.split(/\s+/)[0];
  const firstAlnum = name.replace(/[^A-Za-z0-9]/g, "")[0] ?? name[0];
  return { name, shortName, monogram: firstAlnum.toUpperCase() };
}

/** Resolve the agent's display name: operator override (DB) → env → "Mark". */
export function getAgentDisplayName(override: string | null | undefined): string {
  return override?.trim() || process.env.MARK_DISPLAY_NAME?.trim() || "Agent";
}

/** Whether any agent link is configured (runner endpoint or inbound API token). */
export function isAgentConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(env.MARK_RUNNER_URL ?? env.MARK_WEBHOOK_URL) || Boolean(env.HERMES_AGENT_API_TOKEN?.trim());
}
