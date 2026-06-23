import { INVALID_JSON, arcGuard, fail, ok, readJson } from "@/app/api/v1/arc/_lib/http";
import { fetchPublicPage } from "@/lib/web-fetch/fetch-public-page";

export const runtime = "nodejs"; // needs node:dns + fetch with redirect control

/**
 * Fetch a public website and extract brand signal (title, description, favicon,
 * readable text) for Arc to reason over. SSRF guard + extraction live in
 * fetchPublicPage. No LLM here — Arc structures the result.
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

  const result = await fetchPublicPage(urlRaw);
  if (!result.ok) {
    return fail(result.status === 400 ? "rejected" : "failed", result.message, result.status);
  }
  const { signal } = result.page;
  return ok({ title: signal.title, description: signal.description, faviconUrl: signal.faviconUrl, text: signal.text });
}
