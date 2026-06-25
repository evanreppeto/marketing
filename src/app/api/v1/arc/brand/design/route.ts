import { INVALID_JSON, arcGuard, fail, ok, readJson } from "@/app/api/v1/arc/_lib/http";
import { analyzeBrandDesignFromUrl } from "@/lib/brand-kit/design-fetch";

export const runtime = "nodejs"; // needs node:dns + fetch with redirect control

/**
 * Fetch a public website and extract brand DESIGN (best logo candidate, colors,
 * fonts) for Arc to propose into a draft. SSRF-guarded by analyzeBrandDesignFromUrl
 * (no storage here — propose_brand_profile stores the chosen logo). No LLM.
 *
 *   POST /api/v1/arc/brand/design  { url }
 *   -> 200 { ok, logoUrl, faviconUrl, palette, headingFont, bodyFont, sourceUrl }
 */
export async function POST(request: Request) {
  const allowed = await arcGuard(request);
  if (!allowed.ok) return allowed.response;

  const payload = await readJson(request);
  if (payload === INVALID_JSON || typeof payload !== "object" || payload === null) {
    return fail("rejected", "Request body must be valid JSON.", 400);
  }
  const urlRaw =
    typeof (payload as Record<string, unknown>).url === "string"
      ? ((payload as Record<string, unknown>).url as string).trim()
      : "";
  if (!urlRaw) return fail("rejected", "url is required.", 400);

  const result = await analyzeBrandDesignFromUrl(urlRaw);
  if (!result.ok) {
    return fail(result.status, result.message, result.status === "rejected" ? 400 : 502);
  }
  return ok(result.proposal);
}
