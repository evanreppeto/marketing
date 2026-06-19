import { arcGuard, fail, ok } from "@/app/api/v1/arc/_lib/http";
import { getBusinessContext } from "@/lib/brand-kit/read-model";

/**
 * The org's assembled Arc business context (brand voice, services, banned
 * phrases, proof points, personas, guardrails). The runner fetches this each
 * turn to drive its system prompt. Read-only; falls back to neutral defaults in
 * the read-model when no profile exists.
 *
 *   GET /api/v1/arc/brand/context  ->  { ok, context }
 */
export async function GET(request: Request) {
  const allowed = await arcGuard(request);
  if (!allowed.ok) return allowed.response;
  try {
    const context = await getBusinessContext(allowed.scope.orgId);
    return ok({ context });
  } catch (error) {
    return fail("failed", error instanceof Error ? error.message : "Failed to load brand context.", 502);
  }
}
