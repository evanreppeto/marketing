import { arcGuard, fail, ok } from "@/app/api/v1/arc/_lib/http";
import { getBrandSource, listBrandSources } from "@/lib/brand-knowledge/sources-read-model";

/**
 * Arc reads the uploaded brand source documents. List the inventory, or one
 * document + its extracted knowledge (incl. proposed) via ?id=. Scoped to the
 * token's workspace org via arcGuard so a per-workspace runner token reads its
 * OWN brand docs + extracted knowledge, not the cookie/default org.
 *   GET /api/v1/arc/brand/sources         -> { ok, documents }
 *   GET /api/v1/arc/brand/sources?id=foo  -> { ok, document } | 404
 */
export async function GET(request: Request) {
  const allowed = await arcGuard(request);
  if (!allowed.ok) return allowed.response;
  const id = new URL(request.url).searchParams.get("id");
  try {
    if (id) {
      const document = await getBrandSource(id, allowed.scope.orgId);
      if (!document) return fail("not_found", `No Arc-available brand document for id "${id}".`, 404);
      return ok({ document });
    }
    return ok({ documents: await listBrandSources(allowed.scope.orgId) });
  } catch (error) {
    return fail("failed", error instanceof Error ? error.message : "Failed to read brand documents.", 502);
  }
}
