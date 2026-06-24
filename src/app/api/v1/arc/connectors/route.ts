import { arcGuard, fail, ok } from "@/app/api/v1/arc/_lib/http";
import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/server";
import { resolveRemoteConnectorsForRunner } from "@/lib/connectors/runner-connectors";

/**
 * Remote-MCP connectors the runner should load for this workspace, with decrypted
 * credentials. Bearer + workspace gated; same trust boundary as ARC_AGENT_API_TOKEN
 * (server-to-server only — the token is never echoed to a browser).
 *   GET /api/v1/arc/connectors -> { ok, connectors: [{ toolNamespace, mcpUrl, authHeader, token }] }
 */
export async function GET(request: Request) {
  const allowed = await arcGuard(request);
  if (!allowed.ok) return allowed.response;
  if (!isSupabaseAdminConfigured()) return ok({ connectors: [] });
  const { workspaceId } = allowed.scope;
  try {
    const connectors = await resolveRemoteConnectorsForRunner(getSupabaseAdminClient(), workspaceId);
    return ok({ connectors });
  } catch (error) {
    return fail("failed", error instanceof Error ? error.message : "Failed to load connectors.", 502);
  }
}
