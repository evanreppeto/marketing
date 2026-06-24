import { arcGuard, fail, ok } from "@/app/api/v1/arc/_lib/http";
import { listOpenOpportunities } from "@/lib/opportunities/read-model";

/**
 * Open opportunities (pending/drafting/drafted) for Arc to browse the inbox.
 * Read-only; scoped to the token's workspace org via arcGuard so a per-workspace
 * runner token sees its OWN tenant's inbox, not the cookie/default org.
 *   GET /api/v1/arc/opportunities  ->  { ok, opportunities }
 */
export async function GET(request: Request) {
  const allowed = await arcGuard(request);
  if (!allowed.ok) return allowed.response;
  try {
    return ok({ opportunities: await listOpenOpportunities(undefined, allowed.scope.orgId) });
  } catch (error) {
    return fail("failed", error instanceof Error ? error.message : "Failed to list opportunities.", 502);
  }
}
