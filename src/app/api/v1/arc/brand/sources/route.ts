import { fail, guard, ok } from "@/app/api/v1/arc/_lib/http";
import { getBrandSource, listBrandSources } from "@/lib/brand-knowledge/sources-read-model";

/**
 * Arc reads the uploaded brand source documents. List the inventory, or one
 * document + its extracted knowledge (incl. proposed) via ?id=. Read-only;
 * scoped to Arc-available docs inside the read-model.
 *   GET /api/v1/arc/brand/sources         -> { ok, documents }
 *   GET /api/v1/arc/brand/sources?id=foo  -> { ok, document } | 404
 */
export async function GET(request: Request) {
  const denied = await guard(request);
  if (denied) return denied;
  const id = new URL(request.url).searchParams.get("id");
  try {
    if (id) {
      const document = await getBrandSource(id);
      if (!document) return fail("not_found", `No Arc-available brand document for id "${id}".`, 404);
      return ok({ document });
    }
    return ok({ documents: await listBrandSources() });
  } catch (error) {
    return fail("failed", error instanceof Error ? error.message : "Failed to read brand documents.", 502);
  }
}
