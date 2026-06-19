import { fail, guard, ok } from "@/app/api/v1/arc/_lib/http";
import { getRecentActivity } from "@/lib/activity/read-model";

/**
 * Recent cross-system activity (timeline) for Arc's situational awareness.
 *   GET /api/v1/arc/activity  ->  { ok, entries, summary }
 */
export async function GET(request: Request) {
  const denied = await guard(request);
  if (denied) return denied;
  try {
    const data = await getRecentActivity();
    if (data.status !== "live") return fail("failed", data.message ?? "Activity is unavailable.", 502);
    return ok({ entries: data.entries, summary: data.summary });
  } catch (error) {
    return fail("failed", error instanceof Error ? error.message : "Failed to read activity.", 502);
  }
}
