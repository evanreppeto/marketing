import { type SupabaseClient } from "@supabase/supabase-js";

import { CONNECTOR_REGISTRY } from "@/domain";

import { readConnectorCredential } from "./credentials";
import { listWorkspaceConnectors, resolveConnectorCredentialRef } from "./read-model";

/** A remote MCP connector the runner should load: namespace, endpoint, header, token. */
export type RunnerRemoteConnector = {
  toolNamespace: string;
  mcpUrl: string;
  authHeader: string;
  token: string;
};

/**
 * Enabled, credentialed, remote-MCP connectors for this workspace, with their
 * decrypted token. Native connectors (mcpUrl === null, e.g. gemini-research) are
 * excluded — they have no remote server to load. Secrets are resolved here and only
 * ever returned over the bearer-gated runner route, never to a browser.
 */
export async function resolveRemoteConnectorsForRunner(
  client: SupabaseClient,
  workspaceId: string,
): Promise<RunnerRemoteConnector[]> {
  const views = await listWorkspaceConnectors(client, workspaceId);
  const enabledKeys = new Set(views.filter((v) => v.enabled && v.credentialPresent).map((v) => v.key));

  const out: RunnerRemoteConnector[] = [];
  for (const entry of CONNECTOR_REGISTRY) {
    if (!entry.mcpUrl || !entry.authHeader || !enabledKeys.has(entry.key)) continue;
    const ref = await resolveConnectorCredentialRef(client, workspaceId, entry.key);
    const token = await readConnectorCredential(client, ref);
    if (!token) continue;
    out.push({ toolNamespace: entry.toolNamespace, mcpUrl: entry.mcpUrl, authHeader: entry.authHeader, token });
  }
  return out;
}
