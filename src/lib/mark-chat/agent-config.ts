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
