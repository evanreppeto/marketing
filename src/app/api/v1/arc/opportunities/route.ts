import { fail, guard, ok } from "@/app/api/v1/arc/_lib/http";
import { listOpenOpportunities } from "@/lib/opportunities/read-model";

/**
 * Open opportunities (pending/drafting/drafted) for Arc to browse the inbox.
 * Read-only; org resolved inside the read-model.
 *   GET /api/v1/arc/opportunities  ->  { ok, opportunities }
 */
export async function GET(request: Request) {
  const denied = await guard(request);
  if (denied) return denied;
  try {
    return ok({ opportunities: await listOpenOpportunities() });
  } catch (error) {
    return fail("failed", error instanceof Error ? error.message : "Failed to list opportunities.", 502);
  }
}
