import { arcGuard, fail, ok } from "@/app/api/v1/arc/_lib/http";
import { getWorkspaceSummary, getWorkspaceSettingsDetail } from "@/lib/workspace/summary";

/**
 * Workspace awareness for Arc. The compact snapshot drives Arc's per-turn
 * situational awareness; `detail=full` backs the get_workspace_settings tool.
 *   GET /api/v1/arc/workspace             -> { ok, workspace }  (compact)
 *   GET /api/v1/arc/workspace?detail=full -> { ok, workspace }  (detailed)
 * Read-only. Bearer + workspace gated; secrets are never echoed.
 */
export async function GET(request: Request) {
  const allowed = await arcGuard(request);
  if (!allowed.ok) return allowed.response;
  const { orgId, workspaceId } = allowed.scope;
  const detail = new URL(request.url).searchParams.get("detail") === "full";
  try {
    const workspace = detail
      ? await getWorkspaceSettingsDetail(orgId, workspaceId)
      : await getWorkspaceSummary(orgId, workspaceId);
    return ok({ workspace });
  } catch (error) {
    return fail("failed", error instanceof Error ? error.message : "Failed to load workspace.", 502);
  }
}
