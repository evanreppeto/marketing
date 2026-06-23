import { INVALID_JSON, arcGuard, fail, ok, readJson } from "@/app/api/v1/arc/_lib/http";
import { fetchPublicPage } from "@/lib/web-fetch/fetch-public-page";

export const runtime = "nodejs"; // needs node:dns + fetch with redirect control

/**
 * Arc reads a public web page (SSRF-guarded). Returns readable text + title for
 * Arc to reason over / extract from. Internal only — no outbound side effects.
 *
 *   POST /api/v1/arc/web/fetch  { url }
 *   -> 200 { ok, url, title, text }
 */
export async function POST(request: Request) {
  const allowed = await arcGuard(request);
  if (!allowed.ok) return allowed.response;

  const body = await readJson(request);
  if (body === INVALID_JSON || typeof body !== "object" || body === null) {
    return fail("invalid_request", "Request body must be a JSON object.", 400);
  }
  const urlRaw = typeof (body as Record<string, unknown>).url === "string"
    ? ((body as Record<string, unknown>).url as string).trim()
    : "";
  if (!urlRaw) return fail("invalid_request", 'Field "url" is required.', 400);

  const result = await fetchPublicPage(urlRaw);
  if (!result.ok) {
    return fail(result.status === 400 ? "invalid_request" : "failed", result.message, result.status);
  }
  const { url, signal } = result.page;
  return ok({ url, title: signal.title, text: signal.text });
}
