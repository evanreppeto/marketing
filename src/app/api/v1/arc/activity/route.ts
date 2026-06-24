import { arcGuard, fail, ok } from "@/app/api/v1/arc/_lib/http";
import { getRecentActivity } from "@/lib/activity/read-model";

/**
 * Recent cross-system activity (timeline) for Arc's situational awareness.
 * Scoped to the token's workspace org via arcGuard so a per-workspace runner
 * token sees ONLY its own tenant's activity (the service-role client bypasses
 * RLS, so this app-layer scope is the only boundary).
 *   GET /api/v1/arc/activity  ->  { ok, entries, summary }
 */
export async function GET(request: Request) {
  const allowed = await arcGuard(request);
  if (!allowed.ok) return allowed.response;
  try {
    const data = await getRecentActivity({}, undefined, allowed.scope.orgId);
    if (data.status !== "live") return fail("failed", data.message ?? "Activity is unavailable.", 502);
    return ok({ entries: data.entries, summary: data.summary });
  } catch (error) {
    return fail("failed", error instanceof Error ? error.message : "Failed to read activity.", 502);
  }
}
