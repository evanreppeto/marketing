import { arcGuard, fail, ok } from "@/app/api/v1/arc/_lib/http";
import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/server";
import { listEnabledConnectorsForApi } from "@/lib/connectors/read-model";
import { resolveRemoteConnectorsForRunner } from "@/lib/connectors/runner-connectors";

/**
 * Connectors the runner should load for this workspace. Bearer + workspace gated;
 * same trust boundary as ARC_AGENT_API_TOKEN (server-to-server only — tokens are
 * never echoed to a browser).
 *   GET /api/v1/arc/connectors -> { ok,
 *     connectors: [{ toolNamespace, mcpUrl, authHeader, token }],  // remote-MCP, WITH secrets
 *     enabled:    [{ key, kind, costTier, label, access, capability }]  // all kinds, NO secrets
 *   }
 * `connectors` is the unchanged remote-MCP loader list. `enabled` (BSR-363)
 * advertises every enabled connector by kind + costTier so the runner can see
 * which signal_source / channel plugins are live without handling credentials.
 */
export async function GET(request: Request) {
  const allowed = await arcGuard(request);
  if (!allowed.ok) return allowed.response;
  if (!isSupabaseAdminConfigured()) return ok({ connectors: [], enabled: [] });
  const { workspaceId } = allowed.scope;
  try {
    const client = getSupabaseAdminClient();
    const [connectors, enabled] = await Promise.all([
      resolveRemoteConnectorsForRunner(client, workspaceId),
      listEnabledConnectorsForApi(client, workspaceId),
    ]);
    return ok({ connectors, enabled });
  } catch (error) {
    return fail("failed", error instanceof Error ? error.message : "Failed to load connectors.", 502);
  }
}
