import { arcGuard, fail, ok } from "@/app/api/v1/arc/_lib/http";
import { listProperties } from "@/lib/repos";

/**
 * Read-only property search for Arc — the geo entry point (city / ZIP) for
 * partner and opportunity discovery.
 *
 *   GET /api/v1/arc/crm/properties?city=Chicago&postal_code=60614&property_type=...&q=&limit=50
 */
export async function GET(request: Request) {
  const allowed = await arcGuard(request);
  if (!allowed.ok) return allowed.response;

  const url = new URL(request.url);
  const persona = url.searchParams.get("persona") ?? undefined;
  const city = url.searchParams.get("city") ?? undefined;
  const state = url.searchParams.get("state") ?? undefined;
  const postalCode = url.searchParams.get("postal_code") ?? undefined;
  const propertyType = url.searchParams.get("property_type") ?? undefined;
  const companyId = url.searchParams.get("company_id") ?? undefined;
  const q = url.searchParams.get("q") ?? undefined;
  const limitParam = Number(url.searchParams.get("limit"));
  const limit = Number.isInteger(limitParam) && limitParam > 0 ? limitParam : undefined;

  try {
    const properties = await listProperties({ orgId: allowed.scope.orgId, persona, city, state, postalCode, propertyType, companyId, q, limit });
    return ok({ properties });
  } catch (error) {
    return fail("failed", error instanceof Error ? error.message : "Failed to list properties.", 502);
  }
}
