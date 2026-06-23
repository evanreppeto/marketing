import { INVALID_JSON, arcGuard, fail, ok, readJson } from "@/app/api/v1/arc/_lib/http";
import { fetchBrandSignalFromUrl } from "@/lib/brand-kit/website-fetch";

export const runtime = "nodejs"; // needs node:dns + fetch with redirect control

/**
 * Fetch a public website and extract brand signal (title, description, favicon,
 * readable text) for Arc to reason over. SSRF-guarded by `fetchBrandSignalFromUrl`
 * (shared with the operator first-run flow). No LLM here — Arc structures the result.
 *
 *   POST /api/v1/arc/brand/analyze-website  { url }
 *   -> 200 { ok, title, description, faviconUrl, text }
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

  const result = await fetchBrandSignalFromUrl(urlRaw);
  if (!result.ok) {
    return fail(result.status, result.message, result.status === "rejected" ? 400 : 502);
  }

  const { title, description, faviconUrl, text } = result.signal;
  return ok({ title, description, faviconUrl, text });
}
